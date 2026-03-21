import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

export class GitService {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  async init(): Promise<boolean> {
    try {
      if (!fs.existsSync(path.join(this.repoPath, '.git'))) {
        await this.exec(`git init`, this.repoPath);
        log.info('Git repository initialized');
      }
      return true;
    } catch (error) {
      log.error('Failed to init git:', error);
      return false;
    }
  }

  async isRepo(): Promise<boolean> {
    try {
      const result = await this.exec(`git rev-parse --git-dir`, this.repoPath);
      return result.includes('.git');
    } catch {
      return false;
    }
  }

  async add(file: string): Promise<boolean> {
    try {
      const relativePath = path.relative(this.repoPath, file);
      await this.exec(`git add "${relativePath}"`, this.repoPath);
      return true;
    } catch (error) {
      log.error('Git add failed:', error);
      return false;
    }
  }

  async addAll(): Promise<boolean> {
    try {
      await this.exec(`git add -A`, this.repoPath);
      return true;
    } catch (error) {
      log.error('Git add all failed:', error);
      return false;
    }
  }

  async commit(message: string): Promise<{ success: boolean; hash?: string }> {
    try {
      const result = await this.exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, this.repoPath);
      const hashResult = await this.exec(`git rev-parse HEAD`, this.repoPath);
      return { success: true, hash: hashResult.trim() };
    } catch (error) {
      log.error('Git commit failed:', error);
      return { success: false };
    }
  }

  async getStatus(): Promise<{ files: string[]; clean: boolean }> {
    try {
      const result = await this.exec(`git status --porcelain`, this.repoPath);
      const files = result.split('\n').filter(line => line.trim()).map(line => line.slice(3));
      return { files, clean: files.length === 0 };
    } catch {
      return { files: [], clean: true };
    }
  }

  async getLog(count: number = 20): Promise<Array<{ hash: string; message: string; date: string }>> {
    try {
      const result = await this.exec(
        `git log --pretty=format:"%H|%s|%ad" --date=iso -n ${count}`,
        this.repoPath
      );
      return result.split('\n').filter(Boolean).map(line => {
        const [hash, message, date] = line.split('|');
        return { hash, message, date };
      });
    } catch {
      return [];
    }
  }

  async getDiff(file?: string): Promise<string> {
    try {
      if (file) {
        const relativePath = path.relative(this.repoPath, file);
        return await this.exec(`git diff "${relativePath}"`, this.repoPath);
      }
      return await this.exec(`git diff`, this.repoPath);
    } catch {
      return '';
    }
  }

  async getFileAtCommit(file: string, commitHash: string): Promise<string | null> {
    try {
      const relativePath = path.relative(this.repoPath, file);
      return await this.exec(`git show ${commitHash}:"${relativePath}"`, this.repoPath);
    } catch {
      return null;
    }
  }

  async restore(file: string, commitHash?: string): Promise<boolean> {
    try {
      const relativePath = path.relative(this.repoPath, file);
      if (commitHash) {
        await this.exec(`git checkout ${commitHash} -- "${relativePath}"`, this.repoPath);
      } else {
        await this.exec(`git checkout -- "${relativePath}"`, this.repoPath);
      }
      return true;
    } catch (error) {
      log.error('Git restore failed:', error);
      return false;
    }
  }

  private exec(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
