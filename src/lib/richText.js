const allowedTags = new Set([
  'B', 'BR', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'I', 'LI', 'OL', 'P', 'S', 'SPAN', 'STRIKE', 'STRONG', 'U', 'UL'
]);

const blockedTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG', 'VIDEO']);
const allowedFonts = new Set(['Arial', 'Courier New', 'Georgia', 'Tahoma', 'Times New Roman', 'Verdana']);
const fontSizes = { 1: '10px', 2: '12px', 3: '14px', 4: '16px', 5: '18px', 6: '24px', 7: '32px' };

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const isRichTextMarkup = (value) => /<\/?(?:b|br|div|em|font|h[1-6]|i|li|ol|p|s|span|strike|strong|u|ul)(?:\s|>|\/)/i.test(value);

const safeColor = (value) => {
  if (!value || !globalThis.CSS?.supports?.('color', value)) return '';
  return value;
};

const cleanStyle = (element, styleAttribute) => {
  const parsedStyle = document.createElement('span');
  parsedStyle.setAttribute('style', styleAttribute);
  const styles = [];

  const color = safeColor(parsedStyle.style.color);
  if (color) styles.push(`color: ${color}`);

  const backgroundColor = safeColor(parsedStyle.style.backgroundColor);
  if (backgroundColor) styles.push(`background-color: ${backgroundColor}`);

  const fontFamily = parsedStyle.style.fontFamily
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '');
  if (allowedFonts.has(fontFamily)) styles.push(`font-family: "${fontFamily}"`);

  const fontSize = parsedStyle.style.fontSize.toLowerCase();
  if (Object.values(fontSizes).includes(fontSize)) styles.push(`font-size: ${fontSize}`);

  if (styles.length) element.setAttribute('style', styles.join('; '));
};

export const sanitizeRichTextHtml = (value = '') => {
  const content = String(value);
  if (!isRichTextMarkup(content)) {
    const parsedText = new DOMParser().parseFromString(content, 'text/html').body.textContent || '';
    return escapeHtml(parsedText).replace(/\r\n?|\n/g, '<br>');
  }

  const parsed = new DOMParser().parseFromString(content, 'text/html');
  const sanitizeChildren = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (blockedTags.has(node.tagName)) {
        node.remove();
        return;
      }

      sanitizeChildren(node);
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }

      const styleAttribute = node.getAttribute('style') || '';
      if (node.tagName === 'FONT') {
        const parent = node.parentNode;
        const face = node.getAttribute('face');
        const color = safeColor(node.getAttribute('color'));
        const sizeKey = node.getAttribute('size');
        const size = Object.hasOwn(fontSizes, sizeKey) ? fontSizes[sizeKey] : '';
        const replacement = parsed.createElement('span');
        while (node.firstChild) replacement.appendChild(node.firstChild);
        if (face && allowedFonts.has(face)) replacement.style.fontFamily = face;
        if (color) replacement.style.color = color;
        if (size) replacement.style.fontSize = size;
        parent.replaceChild(replacement, node);
        return;
      }

      [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
      cleanStyle(node, styleAttribute);
    });
  };

  sanitizeChildren(parsed.body);
  return parsed.body.innerHTML;
};

export const richTextToPlainText = (value = '') => {
  const sanitized = sanitizeRichTextHtml(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|h[1-6]|li|p)>/gi, '\n');
  const parsed = new DOMParser().parseFromString(sanitized, 'text/html');
  return (parsed.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};
