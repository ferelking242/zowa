import { ConfigManager } from './config';

export interface GitHubResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class GitHubClient {
  private token: string;
  private baseUrl = 'https://api.github.com';
  private verbose: boolean;

  constructor(private config: ConfigManager) {
    this.token = config.getToken();
    this.verbose = config.isVerbose();
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<GitHubResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    if (this.verbose) {
      console.log(`[GitHub API] ${method} ${endpoint}`);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createRepo(name: string, isPrivate: boolean = false, description?: string): Promise<GitHubResponse> {
    return this.request('POST', '/user/repos', {
      name,
      private: isPrivate,
      description,
      auto_init: false,
    });
  }

  async getRepo(owner: string, repo: string): Promise<GitHubResponse> {
    return this.request('GET', `/repos/${owner}/${repo}`);
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<GitHubResponse> {
    return this.request('GET', `/repos/${owner}/${repo}/branches/${branch}`);
  }

  async getRef(owner: string, repo: string, ref: string): Promise<GitHubResponse> {
    return this.request('GET', `/repos/${owner}/${repo}/git/refs/${ref}`);
  }

  async createBlob(owner: string, repo: string, content: string, encoding: 'utf-8' | 'base64' = 'utf-8'): Promise<GitHubResponse> {
    return this.request('POST', `/repos/${owner}/${repo}/git/blobs`, {
      content,
      encoding,
    });
  }

  async createTree(owner: string, repo: string, tree: any[], baseTree?: string): Promise<GitHubResponse> {
    return this.request('POST', `/repos/${owner}/${repo}/git/trees`, {
      tree,
      base_tree: baseTree,
    });
  }

  async createCommit(owner: string, repo: string, message: string, tree: string, parents: string[]): Promise<GitHubResponse> {
    return this.request('POST', `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree,
      parents,
    });
  }

  async updateRef(owner: string, repo: string, ref: string, sha: string, force: boolean = false): Promise<GitHubResponse> {
    return this.request('PATCH', `/repos/${owner}/${repo}/git/refs/${ref}`, {
      sha,
      force,
    });
  }

  async createRef(owner: string, repo: string, ref: string, sha: string): Promise<GitHubResponse> {
    return this.request('POST', `/repos/${owner}/${repo}/git/refs`, {
      ref,
      sha,
    });
  }

  async getContent(owner: string, repo: string, path: string, ref?: string): Promise<GitHubResponse> {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
    return this.request('GET', endpoint);
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
    branch?: string
  ): Promise<GitHubResponse> {
    return this.request('PUT', `/repos/${owner}/${repo}/contents/${path}`, {
      message,
      content: Buffer.from(content).toString('base64'),
      sha,
      branch,
    });
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string
  ): Promise<GitHubResponse> {
    return this.request('DELETE', `/repos/${owner}/${repo}/contents/${path}`, {
      message,
      sha,
      branch,
    });
  }
}
