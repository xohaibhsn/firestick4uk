"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useCallback, useState, useEffect } from "react";

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const ToolBtn = ({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    style={{
      padding: "5px 9px",
      borderRadius: 6,
      border: "1px solid #E5E5E5",
      background: active ? "#5B21B6" : "#FFFFFF",
      color: active ? "#FFFFFF" : "#333333",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.2,
      transition: "all 0.12s",
      minWidth: 30,
    }}
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#F0EBFF"; }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#FFFFFF"; }}
  >
    {children}
  </button>
);

const Sep = () => (
  <div style={{ width: 1, background: "#E5E5E5", margin: "2px 4px", alignSelf: "stretch" }} />
);

export default function TipTapEditor({ content, onChange, placeholder = "Write your blog post..." }: TipTapEditorProps) {
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [showImgInput, setShowImgInput] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      TextStyle,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "tiptap-link" } }),
      Image.configure({ inline: false, HTMLAttributes: { class: "tiptap-img" } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: content || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        style: "min-height:400px;padding:16px 20px;outline:none;font-family:'Raleway',sans-serif;font-size:15px;line-height:1.8;color:#111111;",
      },
    },
  });

  // Sync content if parent changes it externally (e.g. opening edit modal)
  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    if (!linkUrl) { editor.chain().focus().unsetLink().run(); }
    else { editor.chain().focus().setLink({ href: linkUrl }).run(); }
    setLinkUrl(""); setShowLinkInput(false);
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imgUrl) return;
    editor.chain().focus().setImage({ src: imgUrl }).run();
    setImgUrl(""); setShowImgInput(false);
  }, [editor, imgUrl]);

  if (!editor) return null;

  const charCount = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div style={{ border: "1px solid #E5E5E5", borderRadius: 10, overflow: "hidden", background: "#FFFFFF" }}>
      {/* TOOLBAR */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #E5E5E5", background: "#F9F9F9", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>

        {/* Text style */}
        <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><b>B</b></ToolBtn>
        <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><i>I</i></ToolBtn>
        <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><u>U</u></ToolBtn>
        <ToolBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></ToolBtn>
        <ToolBtn active={false} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear Formatting">✕</ToolBtn>
        <Sep />

        {/* Headings */}
        {([1, 2, 3, 4] as const).map(level => (
          <ToolBtn key={level} active={editor.isActive("heading", { level })} onClick={() => editor.chain().focus().toggleHeading({ level }).run()} title={`Heading ${level}`}>H{level}</ToolBtn>
        ))}
        <ToolBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraph">P</ToolBtn>
        <Sep />

        {/* Lists */}
        <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List">• List</ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered List">1. List</ToolBtn>
        <ToolBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">❝</ToolBtn>
        <Sep />

        {/* Alignment */}
        <ToolBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align Left">⬅</ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align Center">≡</ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align Right">➡</ToolBtn>
        <Sep />

        {/* Link */}
        <ToolBtn active={editor.isActive("link") || showLinkInput} onClick={() => { setShowImgInput(false); setShowLinkInput(v => !v); setLinkUrl(editor.getAttributes("link").href || ""); }} title="Insert Link">🔗</ToolBtn>

        {/* Image */}
        <ToolBtn active={showImgInput} onClick={() => { setShowLinkInput(false); setShowImgInput(v => !v); }} title="Insert Image">🖼️</ToolBtn>

        {/* HR */}
        <ToolBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">—</ToolBtn>
        <Sep />

        {/* Undo / Redo */}
        <ToolBtn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">↩</ToolBtn>
        <ToolBtn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">↪</ToolBtn>
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E5E5E5", background: "#F5F3FF", display: "flex", gap: 8 }}>
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && setLink()}
            placeholder="https://example.com"
            autoFocus
            style={{ flex: 1, border: "1px solid #DDD6FE", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none", color: "#111111" }}
          />
          <button type="button" onClick={setLink} style={{ background: "#5B21B6", color: "#FFF", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>Set</button>
          {editor.isActive("link") && (
            <button type="button" onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkInput(false); }} style={{ background: "#DC2626", color: "#FFF", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>Remove</button>
          )}
          <button type="button" onClick={() => setShowLinkInput(false)} style={{ background: "#E5E5E5", color: "#333", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Image input */}
      {showImgInput && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #E5E5E5", background: "#F5F3FF", display: "flex", gap: 8 }}>
          <input
            type="url"
            value={imgUrl}
            onChange={e => setImgUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addImage()}
            placeholder="https://res.cloudinary.com/... or any image URL"
            autoFocus
            style={{ flex: 1, border: "1px solid #DDD6FE", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none", color: "#111111" }}
          />
          <button type="button" onClick={addImage} style={{ background: "#5B21B6", color: "#FFF", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>Insert</button>
          <button type="button" onClick={() => setShowImgInput(false)} style={{ background: "#E5E5E5", color: "#333", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Editor area */}
      <div style={{ position: "relative" }}>
        <style>{`
          .tiptap-editor .ProseMirror { min-height: 400px; padding: 16px 20px; outline: none; }
          .tiptap-editor .ProseMirror p { margin: 0 0 0.8em; }
          .tiptap-editor .ProseMirror h1 { font-size: 2rem; font-weight: 700; margin: 1.2em 0 0.5em; }
          .tiptap-editor .ProseMirror h2 { font-size: 1.6rem; font-weight: 700; margin: 1.1em 0 0.4em; }
          .tiptap-editor .ProseMirror h3 { font-size: 1.3rem; font-weight: 600; color: #5B21B6; margin: 1em 0 0.4em; }
          .tiptap-editor .ProseMirror h4 { font-size: 1.1rem; font-weight: 600; margin: 0.8em 0 0.3em; }
          .tiptap-editor .ProseMirror ul { list-style: disc; padding-left: 1.4em; margin: 0.5em 0; }
          .tiptap-editor .ProseMirror ol { list-style: decimal; padding-left: 1.4em; margin: 0.5em 0; }
          .tiptap-editor .ProseMirror li { margin: 0.3em 0; }
          .tiptap-editor .ProseMirror blockquote { border-left: 4px solid #5B21B6; padding: 8px 16px; background: #F5F3FF; margin: 1em 0; color: #444; font-style: italic; }
          .tiptap-editor .ProseMirror a.tiptap-link { color: #5B21B6; text-decoration: underline; cursor: pointer; }
          .tiptap-editor .ProseMirror img.tiptap-img { max-width: 100%; border-radius: 8px; margin: 1em 0; display: block; }
          .tiptap-editor .ProseMirror hr { border: none; border-top: 2px solid #E5E5E5; margin: 1.5em 0; }
          .tiptap-editor .ProseMirror strong { font-weight: 700; }
          .tiptap-editor .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #AAAAAA; pointer-events: none; float: left; height: 0; }
        `}</style>
        <div className="tiptap-editor">
          <EditorContent editor={editor} />
        </div>
        <div style={{ padding: "6px 12px", borderTop: "1px solid #F0F0F0", fontSize: 11, color: "#888888", textAlign: "right", background: "#FAFAFA" }}>
          {charCount} characters
        </div>
      </div>
    </div>
  );
}
