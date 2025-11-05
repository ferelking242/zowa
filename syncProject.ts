import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { GitHubOperations, OperationResult } from './operations';
import { ConfigManager } from './config';

export class ProjectSync {
  constructor(
    private operations: GitHubOperations,
    private config: ConfigManager
  ) {}

  async syncDirectory(
    projectPath: string,
    commitMessage?: string,
    repo?: string,
    owner?: string,
    branch?: string
  ): Promise<OperationResult> {
    const ignorePatterns = this.config.getIgnorePatterns();
    const files = this.getFiles(projectPath, ignorePatterns);

    if (files.length === 0) {
      return {
        success: false,
        message: 'No files to sync',
      };
    }

    console.log(`📦 Found ${files.length} files to sync...`);

    const fileContents = files.map(filePath => {
      const absolutePath = join(projectPath, filePath);
      const buffer = readFileSync(absolutePath);
      
      const isBinary = this.isBinaryFile(filePath);
      const content = isBinary
        ? buffer.toString('base64')
        : buffer.toString('utf-8');
      
      return {
        path: filePath,
        content,
      };
    });

    const message = commitMessage || `Sync ${files.length} files from project`;
    
    return await this.operations.pushFiles(
      fileContents,
      message,
      repo,
      owner,
      branch
    );
  }

  private getFiles(dir: string, ignorePatterns: string[], baseDir?: string): string[] {
    const base = baseDir || dir;
    const files: string[] = [];

    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const relativePath = relative(base, fullPath);

      if (this.shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getFiles(fullPath, ignorePatterns, base));
      } else if (stat.isFile()) {
        files.push(relativePath);
      }
    }

    return files;
  }

  private shouldIgnore(path: string, patterns: string[]): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    
    for (const pattern of patterns) {
      if (normalizedPath.includes(pattern)) {
        return true;
      }
      
      if (normalizedPath.startsWith(pattern + '/')) {
        return true;
      }
      
      if (pattern.startsWith('*.') && normalizedPath.endsWith(pattern.slice(1))) {
        return true;
      }
    }

    return false;
  }

  private isBinaryFile(path: string): boolean {
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.bin'];
    return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }
}
