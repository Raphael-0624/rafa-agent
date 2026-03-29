import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

const CodeBlock: React.FC<{ children: string; language?: string }> = ({ children, language }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      // 可以添加复制成功的提示
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="code-block-wrapper">
      <button className="copy-btn" onClick={handleCopy}>
        复制
      </button>
      <pre>
        <code className={language ? `language-${language}` : ''}>
          {children}
        </code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (!inline && children) {
              return (
                <CodeBlock language={language}>
                  {String(children).replace(/\n$/, '')}
                </CodeBlock>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
