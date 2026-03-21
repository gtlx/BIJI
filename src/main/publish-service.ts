import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

export type StaticSiteGenerator = 'hugo' | 'astro' | 'jekyll' | 'vitepress' | 'docusaurus';

interface PublishConfig {
  outputPath: string;
  generator: StaticSiteGenerator;
  siteName?: string;
  baseUrl?: string;
}

export class PublishService {
  private notesPath: string;

  constructor(notesPath: string) {
    this.notesPath = notesPath;
  }

  async checkGenerator(generator: StaticSiteGenerator): Promise<{ available: boolean; version?: string }> {
    try {
      const result = await this.exec(`${generator} version`, this.notesPath);
      const version = result.match(/v?[\d.]+/)?.[0] || 'unknown';
      return { available: true, version };
    } catch {
      return { available: false };
    }
  }

  async publish(config: PublishConfig): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const { outputPath, generator, siteName = 'My Notes', baseUrl = '/' } = config;

      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      switch (generator) {
        case 'hugo':
          return await this.publishHugo(outputPath, siteName, baseUrl);
        case 'astro':
          return await this.publishAstro(outputPath, siteName, baseUrl);
        case 'vitepress':
          return await this.publishVitePress(outputPath, siteName, baseUrl);
        default:
          return { success: false, error: `不支持的生成器: ${generator}` };
      }
    } catch (error) {
      log.error('Publish failed:', error);
      return { success: false, error: String(error) };
    }
  }

  private async publishHugo(outputPath: string, siteName: string, baseUrl: string): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const hugoPath = path.join(outputPath, 'site');
      if (!fs.existsSync(hugoPath)) {
        await this.exec(`hugo new site "${hugoPath}"`, outputPath);
      }

      const contentPath = path.join(hugoPath, 'content');
      if (!fs.existsSync(contentPath)) {
        fs.mkdirSync(contentPath, { recursive: true });
      }

      const notes = this.getAllNotes();
      for (const note of notes) {
        const fileName = this.slugify(note.title) + '.md';
        const filePath = path.join(contentPath, fileName);
        fs.writeFileSync(filePath, note.content);
      }

      const configContent = `
baseURL = "${baseUrl}"
languageCode = "zh-cn"
title = "${siteName}"
theme = "ananke"
`;
      fs.writeFileSync(path.join(hugoPath, 'hugo.toml'), configContent);

      await this.exec(`hugo -d "${path.join(hugoPath, 'public')}"`, hugoPath);

      return { success: true, outputPath: path.join(hugoPath, 'public') };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async publishAstro(outputPath: string, siteName: string, baseUrl: string): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const astroPath = path.join(outputPath, 'site');
      if (!fs.existsSync(astroPath)) {
        await this.exec(`npm create astro@latest "${astroPath}" -- --template minimal --no-install --no-git`, outputPath);
      }

      const srcPath = path.join(astroPath, 'src', 'pages');
      if (!fs.existsSync(srcPath)) {
        fs.mkdirSync(srcPath, { recursive: true });
      }

      const notes = this.getAllNotes();
      for (const note of notes) {
        const fileName = this.slugify(note.title) + '.md';
        const filePath = path.join(srcPath, fileName);
        fs.writeFileSync(filePath, note.content);
      }

      await this.exec(`cd "${astroPath}" && npm install`, astroPath);
      await this.exec(`cd "${astroPath}" && npm run build`, astroPath);

      return { success: true, outputPath: path.join(astroPath, 'dist') };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async publishVitePress(outputPath: string, siteName: string, baseUrl: string): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const vpPath = path.join(outputPath, 'site');
      if (!fs.existsSync(vpPath)) {
        fs.mkdirSync(vpPath, { recursive: true });
      }

      const docsPath = path.join(vpPath, 'docs');
      if (!fs.existsSync(docsPath)) {
        fs.mkdirSync(docsPath, { recursive: true });
      }

      const notes = this.getAllNotes();
      for (const note of notes) {
        const fileName = this.slugify(note.title) + '.md';
        const filePath = path.join(docsPath, fileName);
        fs.writeFileSync(filePath, note.content);
      }

      const configContent = `
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '${siteName}',
  base: '${baseUrl}',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
    ],
    sidebar: [
      {
        text: 'Notes',
        items: [${notes.map(n => `{ text: '${n.title}', link: '/${this.slugify(n.title)}' }`).join(', ')}
        ]
      }
    ]
  }
})
`;
      fs.writeFileSync(path.join(vpPath, 'docs', 'config.ts'), configContent);
      fs.writeFileSync(path.join(vpPath, 'docs', 'index.md'), `# ${siteName}`);

      return { success: true, outputPath: path.join(vpPath, '.vitepress', 'dist') };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private getAllNotes(): Array<{ title: string; content: string }> {
    const notes: Array<{ title: string; content: string }> = [];

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          walkDir(filePath);
        } else if (file.endsWith('.md')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const title = path.basename(file, '.md');
          notes.push({ title, content });
        }
      }
    };

    walkDir(this.notesPath);
    return notes;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private exec(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
