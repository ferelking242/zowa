import { GitHubClient } from './githubClient';
import { ConfigManager } from './config';

export interface OperationResult {
  success: boolean;
  message: string;
  data?: any;
}

export class GitHubOperations {
  constructor(
    private client: GitHubClient,
    private config: ConfigManager
  ) {}

  async ensureRepo(name?: string, owner?: string, isPrivate?: boolean): Promise<OperationResult> {
    const repoName = name || this.config.getDefaultRepo();
    const repoOwner = owner || this.config.getDefaultOwner();
    const privateRepo = isPrivate !== undefined ? isPrivate : this.config.getConfig().repository.default_private;

    if (this.config.shouldDryRun()) {
      return {
        success: true,
        message: `[DRY RUN] Would ensure repo: ${repoOwner}/${repoName}`,
      };
    }

    const checkRepo = await this.client.getRepo(repoOwner, repoName);
    
    if (checkRepo.success) {
      return {
        success: true,
        message: `Repository ${repoOwner}/${repoName} already exists`,
        data: checkRepo.data,
      };
    }

    const createResult = await this.client.createRepo(repoName, privateRepo, 'Auto-created repository');
    
    if (!createResult.success) {
      return {
        success: false,
        message: `Failed to create repo: ${createResult.error}`,
      };
    }

    return {
      success: true,
      message: `Repository ${repoOwner}/${repoName} created successfully`,
      data: createResult.data,
    };
  }

  async pushFiles(
    files: { path: string; content: string }[],
    commitMessage?: string,
    repo?: string,
    owner?: string,
    branch?: string
  ): Promise<OperationResult> {
    const repoName = repo || this.config.getDefaultRepo();
    const repoOwner = owner || this.config.getDefaultOwner();
    const branchName = branch || this.config.getDefaultBranch();
    const message = commitMessage || `${this.config.getConfig().options.commit_message_prefix} Update ${files.length} files`;

    if (this.config.shouldDryRun()) {
      return {
        success: true,
        message: `[DRY RUN] Would push ${files.length} files to ${repoOwner}/${repoName}`,
      };
    }

    await this.ensureRepo(repoName, repoOwner);

    let baseSha: string | undefined;
    const refResult = await this.client.getRef(repoOwner, repoName, `heads/${branchName}`);
    
    if (refResult.success) {
      baseSha = refResult.data.object.sha;
    }

    const tree: any[] = [];
    const batchSize = this.config.getConfig().options.batch_size;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)}...`);
      
      for (const file of batch) {
        const isBinary = this.isBinaryFile(file.path);
        const encoding = isBinary ? 'base64' : 'utf-8';
        const content = file.content;

        const blobResult = await this.client.createBlob(repoOwner, repoName, content, encoding);
        
        if (!blobResult.success) {
          return {
            success: false,
            message: `Failed to create blob for ${file.path}: ${blobResult.error}`,
          };
        }

        tree.push({
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobResult.data.sha,
        });
      }
    }

    const treeResult = await this.client.createTree(repoOwner, repoName, tree, baseSha);
    
    if (!treeResult.success) {
      return {
        success: false,
        message: `Failed to create tree: ${treeResult.error}`,
      };
    }

    const parents = baseSha ? [baseSha] : [];
    const commitResult = await this.client.createCommit(
      repoOwner,
      repoName,
      message,
      treeResult.data.sha,
      parents
    );

    if (!commitResult.success) {
      return {
        success: false,
        message: `Failed to create commit: ${commitResult.error}`,
      };
    }

    const updateRefResult = baseSha
      ? await this.client.updateRef(repoOwner, repoName, `heads/${branchName}`, commitResult.data.sha)
      : await this.client.createRef(repoOwner, repoName, `refs/heads/${branchName}`, commitResult.data.sha);

    if (!updateRefResult.success) {
      return {
        success: false,
        message: `Failed to update ref: ${updateRefResult.error}`,
      };
    }

    return {
      success: true,
      message: `Successfully pushed ${files.length} files to ${repoOwner}/${repoName}`,
      data: {
        commit: commitResult.data.sha,
        filesCount: files.length,
      },
    };
  }

  async updateFile(
    path: string,
    content: string,
    commitMessage?: string,
    repo?: string,
    owner?: string,
    branch?: string
  ): Promise<OperationResult> {
    const repoName = repo || this.config.getDefaultRepo();
    const repoOwner = owner || this.config.getDefaultOwner();
    const branchName = branch || this.config.getDefaultBranch();
    const message = commitMessage || `${this.config.getConfig().options.commit_message_prefix} Update ${path}`;

    if (this.config.shouldDryRun()) {
      return {
        success: true,
        message: `[DRY RUN] Would update file: ${path}`,
      };
    }

    const existing = await this.client.getContent(repoOwner, repoName, path, branchName);
    const sha = existing.success ? existing.data.sha : undefined;

    const result = await this.client.createOrUpdateFile(
      repoOwner,
      repoName,
      path,
      content,
      message,
      sha,
      branchName
    );

    if (!result.success) {
      return {
        success: false,
        message: `Failed to update file: ${result.error}`,
      };
    }

    return {
      success: true,
      message: `Successfully updated ${path}`,
      data: result.data,
    };
  }

  private isBinaryFile(path: string): boolean {
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.bin'];
    return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }
}
