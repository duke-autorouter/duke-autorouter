import React from 'react';
import { marked } from 'marked';

// Render a small Markdown vocabulary as React nodes. Provider HTML is never executed.
export function Markdown({ text }: { text: string }) {
  function render(tokens: any[]): React.ReactNode[] {
    return tokens.map((token, i) => {
      const child = token.tokens ? render(token.tokens) : token.text;
      switch (token.type) {
        case 'space': return null;
        case 'heading': return React.createElement(`h${Math.min(Math.max(token.depth, 2), 6)}`, { key: i }, child);
        case 'paragraph': return <p key={i}>{child}</p>;
        case 'strong': return <strong key={i}>{child}</strong>;
        case 'em': return <em key={i}>{child}</em>;
        case 'del': return <del key={i}>{child}</del>;
        case 'code': return <pre key={i}><code>{token.text}</code></pre>;
        case 'codespan': return <code key={i}>{token.text}</code>;
        case 'br': return <br key={i} />;
        case 'hr': return <hr key={i} />;
        case 'blockquote': return <blockquote key={i}>{child}</blockquote>;
        case 'list': return React.createElement(token.ordered ? 'ol' : 'ul', { key: i, ...(token.ordered ? { start: token.start } : {}) },
          token.items.map((item: any, j: number) => <li key={j}>{render(item.tokens)}</li>));
        case 'link': return /^https?:\/\//i.test(token.href)
          ? <a key={i} href={token.href} target="_blank" rel="noreferrer">{child}</a>
          : <span key={i}>{child}</span>;
        case 'image': return <span key={i}>{token.text || 'Image'}</span>;
        case 'table': return <div className="markdown-table" key={i}><table><thead><tr>{token.header.map((cell: any, j: number) => <th key={j}>{render(cell.tokens)}</th>)}</tr></thead>
          <tbody>{token.rows.map((row: any[], j: number) => <tr key={j}>{row.map((cell: any, k: number) => <td key={k}>{render(cell.tokens)}</td>)}</tr>)}</tbody></table></div>;
        case 'html': return <span key={i}>{token.raw}</span>;
        default: return <React.Fragment key={i}>{child ?? token.raw}</React.Fragment>;
      }
    });
  }
  return <div className="markdown">{render(marked.lexer(text))}</div>;
}
