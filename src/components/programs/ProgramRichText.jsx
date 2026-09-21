import React from 'react';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

const ProgramRichText = ({ children, className = '' }) => (
  <div className={`whitespace-pre-wrap break-words leading-8 ${className}`}>
    {String(children || '').split(URL_PATTERN).map((part, index) => (
      /^https?:\/\//.test(part) ? (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="font-black text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
        >
          {part}
        </a>
      ) : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ))}
  </div>
);

export default ProgramRichText;
