'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Blocks,
  Bold,
  Braces,
  Code2,
  Eraser,
  Eye,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';

/**
 * Splits a full HTML document into the parts surrounding the <body> content so
 * the visual editor can be bound to the editable body fragment only, while the
 * document shell (doctype, head, body attributes) is preserved on save.
 */
function splitDocument(html: string): { prefix: string; content: string; suffix: string } {
  const match = html.match(/^([\s\S]*?<body[^>]*>)([\s\S]*?)(<\/body>[\s\S]*)$/i);
  if (match) {
    return { prefix: match[1], content: match[2], suffix: match[3] };
  }
  return { prefix: '', content: html, suffix: '' };
}

const isDocumentWrapped = (html: string) => /<body[^>]*>/i.test(html);

/**
 * Reads the <body> tag's inline style so the editable canvas reproduces the
 * font, text color and background of the real email, independently of the
 * app theme (which would otherwise override utility classes).
 */
function extractBodyStyles(html: string): React.CSSProperties {
  const bodyTag = html.match(/<body([^>]*)>/i);
  if (!bodyTag) return {};
  const styleAttr = bodyTag[1].match(/style\s*=\s*"([^"]*)"/i)?.[1] ?? '';
  if (!styleAttr) return {};

  const allowed = ['color', 'background-color', 'font-family', 'line-height', 'font-size'];
  const styles: React.CSSProperties = {};

  for (const declaration of styleAttr.split(';')) {
    const [rawProperty, ...rawValue] = declaration.split(':');
    const property = rawProperty?.trim().toLowerCase();
    const value = rawValue.join(':').trim();
    if (!property || !value || !allowed.includes(property)) continue;

    const camelCased = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (styles as any)[camelCased] = value;
  }

  return styles;
}

/**
 * Reusable, email-client-safe content blocks. Every block uses inline styles
 * only (no <style> tags, no external CSS) because most email clients — Gmail in
 * particular — strip <style> blocks and class-based rules.
 */
const EMAIL_BLOCKS: { id: string; label: string; description: string; html: string }[] = [
  {
    id: 'button',
    label: 'Botón',
    description: 'CTA con color y enlace',
    html: `<div style="text-align: center; margin: 24px 0;"><a href="{{meetingPageUrl}}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; font-family: Arial, sans-serif;">Ver detalles</a></div><p><br></p>`,
  },
  {
    id: 'header',
    label: 'Encabezado',
    description: 'Franja con título destacado',
    html: `<div style="background-color: #4f46e5; color: #ffffff; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;"><h1 style="margin: 0; font-size: 28px; color: #ffffff; font-family: Arial, sans-serif;">Título del encabezado</h1></div><p><br></p>`,
  },
  {
    id: 'details',
    label: 'Tabla de detalles',
    description: 'Filas etiqueta / valor con variables',
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse; margin: 24px 0; font-family: Arial, sans-serif;"><tbody><tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">Fecha y hora</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">{{startTime}}</td></tr><tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">Duración</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">{{duration}} minutos</td></tr><tr><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">Ubicación</td><td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-weight: bold; text-align: right;">{{location}}</td></tr></tbody></table><p><br></p>`,
  },
  {
    id: 'spacer',
    label: 'Espaciador',
    description: 'Espacio vertical en blanco',
    html: `<div style="height: 24px; line-height: 24px; font-size: 0;">&nbsp;</div><p><br></p>`,
  },
  {
    id: 'divider',
    label: 'Separador',
    description: 'Línea divisoria horizontal',
    html: `<div style="border-top: 1px solid #e5e7eb; margin: 24px 0; font-size: 0; line-height: 0;">&nbsp;</div><p><br></p>`,
  },
];

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** Variables (without braces) offered in the "insert variable" menu. */
  variables?: string[];
  placeholder?: string;
  minHeight?: number;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  variables = [],
  placeholder = 'Escribe aquí el contenido del email...',
  minHeight = 320,
  className,
}: RichTextEditorProps) {
  const [mode, setMode] = React.useState<'visual' | 'html'>('visual');
  const editorRef = React.useRef<HTMLDivElement>(null);
  const savedRangeRef = React.useRef<Range | null>(null);

  const { prefix, content, suffix } = splitDocument(value);
  const bodyStyles = React.useMemo(() => extractBodyStyles(value), [value]);

  // Keep the contentEditable in sync when the value changes from outside
  // (switching templates, entering edit mode, or editing in HTML mode).
  React.useEffect(() => {
    if (mode !== 'visual') return;
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== content) {
      el.innerHTML = content;
    }
  }, [content, mode]);

  const emitFromEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    const next = isDocumentWrapped(value) ? `${prefix}${el.innerHTML}${suffix}` : el.innerHTML;
    onChange(next);
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editorRef.current?.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    }
  };

  const restoreSelection = () => {
    const range = savedRangeRef.current;
    const selection = window.getSelection();
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    saveSelection();
    emitFromEditor();
  };

  const insertVariable = (name: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('insertText', false, `{{${name}}}`);
    saveSelection();
    emitFromEditor();
  };

  /**
   * Inserts raw HTML at the caret by manipulating the DOM directly.
   * document.execCommand('insertHTML') runs the fragment through the browser's
   * editing sanitizer, which rewrites style attributes and drops properties
   * such as font-size / font-family — unacceptable for email markup, where
   * inline styles must survive verbatim.
   */
  const insertBlock = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    restoreSelection();

    const selection = window.getSelection();
    let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range || !el.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }

    range.deleteContents();
    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    if (lastNode && selection) {
      const caret = document.createRange();
      caret.setStartAfter(lastNode);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      savedRangeRef.current = caret.cloneRange();
    }

    emitFromEditor();
  };

  const handleLink = () => {
    const url = window.prompt('URL del enlace:', 'https://');
    if (url) exec('createLink', url);
  };

  const toggleMode = (next: 'visual' | 'html') => {
    if (next === mode) return;
    if (next === 'html') {
      // Make sure any pending visual edits are reflected in `value` first.
      emitFromEditor();
    }
    setMode(next);
  };

  const toolbarButtons: { icon: typeof Bold; label: string; onClick: () => void }[] = [
    { icon: Undo2, label: 'Deshacer', onClick: () => exec('undo') },
    { icon: Redo2, label: 'Rehacer', onClick: () => exec('redo') },
  ];

  return (
    <div className={cn('rounded-lg border border-input bg-background', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-2">
        <div className="mr-1 flex items-center gap-1">
          {toolbarButtons.map(({ icon: Icon, label, onClick }) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title={label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClick}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <div className="mr-1 flex items-center gap-1 border-l pl-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Párrafo" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'p')}>
            <Pilcrow className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Título" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h1')}>
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Subtítulo" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h2')}>
            <Heading2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mr-1 flex items-center gap-1 border-l pl-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Negrita" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
            <Bold className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Cursiva" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
            <Italic className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Subrayado" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>
            <Underline className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Tachado" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')}>
            <Strikethrough className="h-4 w-4" />
          </Button>
        </div>

        <div className="mr-1 flex items-center gap-1 border-l pl-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Lista con viñetas" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>
            <List className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Enlace" onMouseDown={(e) => e.preventDefault()} onClick={handleLink}>
            <Link2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="mr-1 flex items-center gap-1 border-l pl-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Alinear a la izquierda" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')}>
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Centrar" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')}>
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Alinear a la derecha" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')}>
            <AlignRight className="h-4 w-4" />
          </Button>
          <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent" title="Color de texto">
            <span className="text-sm font-semibold">A</span>
            <input
              type="color"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => exec('foreColor', e.target.value)}
            />
          </label>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Limpiar formato" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>
            <Eraser className="h-4 w-4" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1 border-l">
              <Blocks className="h-4 w-4" />
              Bloque
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Insertar bloque</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {EMAIL_BLOCKS.map((block) => (
              <DropdownMenuItem key={block.id} onSelect={() => insertBlock(block.html)} className="flex flex-col items-start gap-0.5">
                <span>{block.label}</span>
                <span className="text-xs text-muted-foreground">{block.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {variables.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1 border-l">
                <Braces className="h-4 w-4" />
                Variable
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>Insertar variable</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {variables.map((name) => (
                <DropdownMenuItem key={name} onSelect={() => insertVariable(name)}>
                  <code className="text-xs">{`{{${name}}}`}</code>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            variant={mode === 'visual' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => toggleMode('visual')}
          >
            <Eye className="h-3.5 w-3.5" />
            Visual
          </Button>
          <Button
            type="button"
            variant={mode === 'html' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => toggleMode('html')}
          >
            <Code2 className="h-3.5 w-3.5" />
            HTML
          </Button>
        </div>
      </div>

      {mode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            saveSelection();
            emitFromEditor();
          }}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          data-placeholder={placeholder}
          className="max-w-none overflow-y-auto p-4 focus:outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
          style={{
            minHeight,
            color: '#333333',
            backgroundColor: '#ffffff',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '14px',
            lineHeight: '1.6',
            ...bodyStyles,
          }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ minHeight }}
          className="w-full resize-y rounded-b-lg bg-background px-3 py-2 font-mono text-xs focus:outline-none"
        />
      )}
    </div>
  );
}
