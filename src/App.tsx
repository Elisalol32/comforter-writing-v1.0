import React, { useState, useRef, useEffect } from 'react';
import { 
  Heart, 
  Eye, 
  EyeOff, 
  FileText, 
  FileDown, 
  Copy, 
  Scissors, 
  ClipboardPaste,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

export default function App() {
  const [isAllVisible, setIsAllVisible] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('');
  const [isEmpty, setIsEmpty] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedContent = localStorage.getItem('essay-editor-content');
    if (savedContent && editorRef.current) {
      editorRef.current.innerHTML = savedContent;
      checkEmpty();
      setLastSaved(localStorage.getItem('essay-editor-last-saved'));
    }
  }, []);

  // Auto-save every 10 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      saveToLocalStorage();
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, []);

  const saveToLocalStorage = () => {
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      const now = new Date().toLocaleTimeString();
      localStorage.setItem('essay-editor-content', content);
      localStorage.setItem('essay-editor-last-saved', now);
      setLastSaved(now);
      showStatus('已自动保存 ✨');
    }
  };

  // Handle clicking on hearts to restore text
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('heart-placeholder')) {
        const originalText = target.getAttribute('data-content');
        if (originalText) {
          const textNode = document.createTextNode(originalText);
          target.parentNode?.replaceChild(textNode, target);
          checkEmpty();
        }
      }
    };

    const handleInput = () => {
      checkEmpty();
    };

    const editor = editorRef.current;
    editor?.addEventListener('click', handleClick);
    editor?.addEventListener('input', handleInput);
    return () => {
      editor?.removeEventListener('click', handleClick);
      editor?.removeEventListener('input', handleInput);
    };
  }, []);

  const checkEmpty = () => {
    if (editorRef.current) {
      // Use textContent to check if there's any actual text or placeholders
      const text = editorRef.current.textContent || '';
      setIsEmpty(text.trim() === '' && editorRef.current.querySelectorAll('.heart-placeholder').length === 0);
    }
  };

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  };

  const handleHideSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      showStatus('请先选中一段文字哦 ❤️');
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    const span = document.createElement('span');
    span.className = 'heart-placeholder';
    span.setAttribute('data-content', selectedText);
    span.textContent = '❤️';
    span.title = '点击恢复内容';

    range.deleteContents();
    range.insertNode(span);
    
    // Clear selection
    selection.removeAllRanges();
    showStatus('已悄悄藏起来啦~');
    checkEmpty();
  };

  const toggleAll = () => {
    const editor = editorRef.current;
    if (!editor) return;

    if (isAllVisible) {
      const placeholders = editor.querySelectorAll('.heart-placeholder');
      if (placeholders.length === 0) {
        showStatus('没有可以隐藏的内容哦~');
        return;
      }
      placeholders.forEach((el) => {
        const content = el.getAttribute('data-content');
        if (content) {
          const span = document.createElement('span');
          span.className = 'hidden-text';
          span.setAttribute('data-original-content', content);
          span.textContent = content;
          el.parentNode?.replaceChild(span, el);
        }
      });
      setIsAllVisible(false);
      showStatus('已全部显示原文');
    } else {
      const hiddenSpans = editor.querySelectorAll('.hidden-text');
      hiddenSpans.forEach((el) => {
        const content = el.getAttribute('data-original-content');
        if (content) {
          const span = document.createElement('span');
          span.className = 'heart-placeholder';
          span.setAttribute('data-content', content);
          span.textContent = '❤️';
          el.parentNode?.replaceChild(span, el);
        }
      });
      setIsAllVisible(true);
      showStatus('已重新藏好啦~');
    }
    checkEmpty();
  };

  const handleImportTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (editorRef.current && event.target?.result) {
        const text = event.target.result as string;
        // Convert plain text newlines to HTML paragraphs for formatting support
        const html = text.split(/\r?\n/).map(line => line.trim() === '' ? '<p><br></p>' : `<p>${line}</p>`).join('');
        editorRef.current.innerHTML = html;
        showStatus('TXT 导入成功！');
        checkEmpty();
      }
    };
    reader.readAsText(file);
  };

  const handleImportDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Use convertToHtml to preserve basic formatting like paragraphs
      const result = await mammoth.convertToHtml({ arrayBuffer });
      if (editorRef.current) {
        editorRef.current.innerHTML = result.value;
        showStatus('Word 导入成功！');
        checkEmpty();
      }
    } catch (err) {
      console.error(err);
      showStatus('导入 Word 失败，请重试。');
    }
  };

  const handleExportDocx = async () => {
    if (!editorRef.current) return;

    // We need to get the text including hidden content
    const clone = editorRef.current.cloneNode(true) as HTMLElement;
    
    // Replace heart placeholders
    clone.querySelectorAll('.heart-placeholder').forEach(el => {
      const content = el.getAttribute('data-content');
      if (content) el.replaceWith(content);
    });

    // Replace hidden-text spans
    clone.querySelectorAll('.hidden-text').forEach(el => {
      const content = el.getAttribute('data-original-content');
      if (content) el.replaceWith(content);
    });

    // Extract paragraphs properly from the HTML structure
    const docChildren: Paragraph[] = [];
    
    // Function to extract text from a node, preserving line breaks within it
    const getText = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === 'BR') return '\n';
        let text = '';
        el.childNodes.forEach(child => {
          text += getText(child);
        });
        return text;
      }
      return '';
    };

    // Iterate through top-level nodes to identify paragraphs
    clone.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          docChildren.push(new Paragraph({
            children: [new TextRun(text)],
            spacing: { after: 200 }
          }));
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const text = getText(el).trim();
        
        // If it's a block element or has content, treat as paragraph
        const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(el.tagName);
        
        if (text || isBlock) {
          // Split by internal newlines if any (e.g. from <br>)
          const lines = text.split('\n');
          lines.forEach(line => {
            docChildren.push(new Paragraph({
              children: [new TextRun(line)],
              spacing: { after: 200 }
            }));
          });
          
          // If it was an empty block, add an empty paragraph to maintain spacing
          if (!text && isBlock) {
            docChildren.push(new Paragraph({
              children: [new TextRun("")],
              spacing: { after: 200 }
            }));
          }
        }
      }
    });

    // Fallback if no children were identified
    if (docChildren.length === 0) {
      const fallbackText = clone.innerText.trim();
      fallbackText.split(/\r?\n/).forEach(line => {
        docChildren.push(new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 200 }
        }));
      });
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children: docChildren,
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, "我的论文.docx");
    showStatus('导出成功！');
  };

  const handleClipboard = (action: 'copy' | 'cut' | 'paste') => {
    if (!editorRef.current) return;
    
    // Browser built-in commands
    document.execCommand(action);
    showStatus(`已执行${action === 'copy' ? '复制' : action === 'cut' ? '剪切' : '粘贴'}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-gradient-to-br from-pink-50 to-pink-100 font-sans">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl md:text-5xl font-display text-pink-primary drop-shadow-sm flex items-center justify-center gap-3">
          <Heart className="fill-pink-primary text-pink-primary" />
          棉被论文写作助手
          <Heart className="fill-pink-primary text-pink-primary" />
        </h1>
        <div className="flex flex-col items-center gap-1 mt-2">
          <p className="text-pink-400 italic">每一个❤️里，都藏着你努力过的痕迹。</p>
          {lastSaved && (
            <p className="text-xs text-pink-300 font-medium bg-white/50 px-3 py-1 rounded-full border border-pink-100">
              上次自动保存: {lastSaved}
            </p>
          )}
        </div>
      </motion.div>

      {/* Toolbar */}
      <div className="w-full max-w-5xl bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-3 mb-4 flex flex-wrap items-center justify-between gap-2 border border-pink-100">
        <div className="flex flex-wrap items-center gap-2">
          {/* Import Group */}
          <div className="flex items-center bg-pink-50 rounded-xl p-1 gap-1">
            <label className="cursor-pointer hover:bg-white p-2 rounded-lg transition-colors flex items-center gap-2 text-sm text-pink-600 font-medium">
              <Upload size={18} />
              导入 TXT
              <input type="file" accept=".txt" className="hidden" onChange={handleImportTxt} />
            </label>
            <label className="cursor-pointer hover:bg-white p-2 rounded-lg transition-colors flex items-center gap-2 text-sm text-pink-600 font-medium">
              <FileText size={18} />
              导入 WORD
              <input type="file" accept=".docx" className="hidden" onChange={handleImportDocx} />
            </label>
          </div>

          <div className="h-6 w-px bg-pink-200 mx-1 hidden sm:block" />

          {/* Clipboard Group */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => handleClipboard('copy')}
              className="p-2 hover:bg-pink-50 rounded-lg text-pink-500 transition-colors" 
              title="复制"
            >
              <Copy size={20} />
            </button>
            <button 
              onClick={() => handleClipboard('cut')}
              className="p-2 hover:bg-pink-50 rounded-lg text-pink-500 transition-colors" 
              title="剪切"
            >
              <Scissors size={20} />
            </button>
            <button 
              onClick={() => handleClipboard('paste')}
              className="p-2 hover:bg-pink-50 rounded-lg text-pink-500 transition-colors" 
              title="粘贴"
            >
              <ClipboardPaste size={20} />
            </button>
          </div>

          <div className="h-6 w-px bg-pink-200 mx-1 hidden sm:block" />

          {/* Special Features */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleHideSelection}
              className="flex items-center gap-2 px-4 py-2 bg-pink-primary text-white rounded-xl hover:bg-pink-dark transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <Heart size={18} fill="white" />
              <span className="hidden sm:inline">隐藏选中</span>
            </button>
            <button 
              onClick={toggleAll}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-pink-200 text-pink-500 rounded-xl hover:bg-pink-50 transition-all shadow-sm active:scale-95"
            >
              {isAllVisible ? <Eye size={18} /> : <EyeOff size={18} />}
              <span className="hidden sm:inline">{isAllVisible ? '显示所有' : '隐藏所有'}</span>
            </button>
          </div>
        </div>

        {/* Export */}
        <button 
          onClick={handleExportDocx}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-pink-400 to-pink-500 text-white rounded-xl hover:from-pink-500 hover:to-pink-600 transition-all shadow-md hover:shadow-lg active:scale-95 ml-auto"
        >
          <FileDown size={18} />
          <span>导出 Word</span>
        </button>
      </div>

      {/* Editor Area */}
      <div className="w-full max-w-5xl flex-grow relative group">
        <div 
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="w-full h-full min-h-[60vh] bg-white rounded-3xl shadow-xl p-8 md:p-12 outline-none border-2 border-transparent focus:border-pink-200 transition-all text-lg leading-relaxed overflow-y-auto"
        />
        
        {/* Empty State Placeholder (Simulated) */}
        {isEmpty && (
          <div className="absolute top-12 left-12 pointer-events-none text-gray-300 italic text-xl">
            在这里开始你的创作吧...
          </div>
        )}
      </div>

      {/* Status Toast */}
      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 px-6 py-3 bg-pink-dark text-white rounded-full shadow-2xl z-50 flex items-center gap-2 font-medium"
          >
            <Heart size={16} fill="white" />
            {status}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-8 text-pink-300 text-sm flex items-center gap-2">
        棉被论文写作助手v1.0
      </footer>
    </div>
  );
}
