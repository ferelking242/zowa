import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GitHubConfig {
  authentication: {
    github_token: string;
    github_username: string;
  };
  repository: {
    default_repo_name: string;
    default_repo_owner: string;
    default_branch: string;
    default_private: boolean;
  };
  options: {
    auto_commit: boolean;
    commit_message_prefix: string;
    dry_run: boolean;
    verbose: boolean;
    batch_size: number;
  };
  ignore: {
    patterns: string[];
  };
}

export class ConfigManager {
  private config: GitHubConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(__dirname, 'config.ini');
    
    console.log('📋 [CONFIG] Reading configuration from config.ini only');
    
    this.config = this.parseConfig(this.configPath);
    this.validateConfig();
  }

  private parseConfig(filePath: string): GitHubConfig {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const config: any = {
      authentication: {},
      repository: {},
      options: {},
      ignore: {}
    };

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }

      const [key, ...valueParts] = trimmed.split('=');
      if (!key || valueParts.length === 0) continue;

      let value = valueParts.join('=').trim();
      
      const commentIndex = value.search(/[#;]/);
      if (commentIndex !== -1) {
        value = value.substring(0, commentIndex).trim();
      }
      
      const parsedValue = this.parseValue(value);

      if (currentSection && config[currentSection]) {
        config[currentSection][key.trim()] = parsedValue;
      }
    }

    return config as GitHubConfig;
  }

  private parseValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value))) return Number(value);
    if (value.includes(',')) {
      return value.split(',').map(v => v.trim());
    }
    return value;
  }

  private validateConfig(): void {
    const token = this.getToken();
    if (!token || token.length < 10 || token === 'YOUR_GITHUB_TOKEN_HERE') {
      throw new Error('Invalid or missing GitHub token. Set GITHUB_TOKEN environment variable or update config.ini');
    }

    const username = this.getUsername();
    if (!username || username === 'YOUR_GITHUB_USERNAME') {
      throw new Error('Missing GitHub username. Set GITHUB_USERNAME environment variable or update config.ini');
    }

    const repoName = this.getDefaultRepo();
    if (!repoName || repoName === 'your-repo-name') {
      throw new Error('Invalid or missing repository name. Set GITHUB_REPO_NAME environment variable or update config.ini');
    }

    const repoOwner = this.getDefaultOwner();
    if (!repoOwner || repoOwner === 'YOUR_GITHUB_USERNAME') {
      throw new Error('Invalid or missing repository owner. Set GITHUB_REPO_OWNER environment variable or update config.ini');
    }
  }

  public getToken(): string {
    return this.config.authentication.github_token;
  }

  public getUsername(): string {
    return this.config.authentication.github_username;
  }

  public getDefaultRepo(): string {
    return this.config.repository.default_repo_name;
  }

  public getDefaultOwner(): string {
    return this.config.repository.default_repo_owner;
  }

  public getDefaultBranch(): string {
    return this.config.repository.default_branch;
  }

  public getConfig(): GitHubConfig {
    return this.config;
  }

  public shouldDryRun(): boolean {
    return this.config.options.dry_run;
  }

  public isVerbose(): boolean {
    return this.config.options.verbose;
  }

  public getIgnorePatterns(): string[] {
    const patterns = this.config.ignore.patterns;
    return Array.isArray(patterns) ? patterns : [patterns];
  }
}
