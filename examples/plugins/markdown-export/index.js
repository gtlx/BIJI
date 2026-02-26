const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');

let api = null;

async function init(pluginApi) {
  api = pluginApi;
  
  api.registerCommand('export:markdown', async (noteId) => {
    const note = await api.getNote(noteId);
    if (!note) return;

    const result = await dialog.showSaveDialog({
      defaultPath: `${note.title}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });

    if (!result.canceled && result.filePath) {
      const content = convertToMarkdown(note);
      fs.writeFileSync(result.filePath, content, 'utf-8');
      api.showNotification('导出成功', `笔记已导出到 ${result.filePath}`);
    }
  });

  api.onNoteUpdated((note) => {
    console.log('Note updated:', note.id);
  });
}

function convertToMarkdown(note) {
  let content = `# ${note.title}\n\n`;
  content += `创建时间: ${new Date(note.createdAt).toLocaleString()}\n`;
  content += `更新时间: ${new Date(note.updatedAt).toLocaleString()}\n`;
  
  if (note.tags.length > 0) {
    content += `\n标签: ${note.tags.join(', ')}\n`;
  }
  
  content += `\n---\n\n`;
  content += note.content;
  
  return content;
}

function destroy() {
  console.log('Markdown Export plugin destroyed');
}

module.exports = { init, destroy };
