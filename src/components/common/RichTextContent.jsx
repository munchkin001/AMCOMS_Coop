import { sanitizeRichTextHtml } from '../../lib/richText';

const RichTextContent = ({ content, className = '' }) => (
  <div
    className={className}
    dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(content || '') }}
  />
);

export default RichTextContent;
