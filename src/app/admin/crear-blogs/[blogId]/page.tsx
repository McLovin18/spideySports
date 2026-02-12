"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import { db, storage } from "@/app/utils/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import styles from "../blogsAdmin.module.css";

type Paragraph = {
  type: "text" | "image";
  content: string | File;
};

export default function BlogEditorPage() {
  const router = useRouter();
  const params = useParams();
  const blogId = (params as any).blogId || null;
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([{ type: "text", content: "" }]);

  // Cargar blog si existe
  useEffect(() => {
    if (!blogId) return;

    const fetchBlog = async () => {
      const blogRef = doc(db, "blogs", blogId);
      const blogSnap = await getDoc(blogRef);
      if (blogSnap.exists()) {
        const data: any = blogSnap.data();
        setTitle(data.title);
        setSummary(data.summary);
        const loadedParagraphs: Paragraph[] = data.content.map((p: any) =>
          typeof p.content === "string" ? { type: p.type, content: p.content } : { type: p.type, content: p.content }
        );
        setParagraphs(loadedParagraphs.length ? loadedParagraphs : [{ type: "text", content: "" }]);
      }
    };
    fetchBlog();
  }, [blogId]);

  const handleParagraphChange = (index: number, value: string) => {
    const newParagraphs = [...paragraphs];
    if (newParagraphs[index].type === "text") newParagraphs[index].content = value;
    setParagraphs(newParagraphs);
  };

  const addParagraph = () => setParagraphs([...paragraphs, { type: "text", content: "" }]);

  const addImageParagraph = (file: File) => {
    setParagraphs([...paragraphs, { type: "image", content: file }]);
  };

  const toggleBold = (index: number) => {
    const newParagraphs = [...paragraphs];
    const p = newParagraphs[index];
    if (p.type === "text") {
      const text = p.content as string;
      p.content = text.startsWith("<b>") && text.endsWith("</b>") ? text.replace(/^<b>|<\/b>$/g, "") : `<b>${text}</b>`;
      setParagraphs(newParagraphs);
    }
  };

  const removeParagraph = (index: number) => {
    setParagraphs(paragraphs.filter((_, i) => i !== index));
  };

  const uploadParagraphImage = async (file: File) => {
    const imageRef = ref(storage, `blogs/${Date.now()}_${file.name}`);
    await uploadBytes(imageRef, file);
    return await getDownloadURL(imageRef);
  };


  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!title || !summary || paragraphs.some(p => p.type === "text" && !p.content)) {
        return alert("Completa todos los campos de texto");
    }

    // Subir imágenes nuevas y reemplazar File por URL
    const uploadedParagraphs = await Promise.all(
        paragraphs.map(async (p) => {
        if (p.type === "image" && p.content instanceof File) {
            const url = await uploadParagraphImage(p.content);
            return { type: "image", content: url };
        }
        // Mantener imágenes existentes (URL)
        return p;
        })
    );

    // Determinar la miniatura: la primera imagen (ya sea nueva o existente)
    const firstImage = uploadedParagraphs.find((p) => p.type === "image");
    const thumbnail = firstImage ? firstImage.content : null;

    // Guardar en Firestore
    const blogRef = blogId
        ? doc(db, "blogs", blogId)
        : doc(db, "blogs", title + "_" + Date.now());
    await setDoc(blogRef, {
        title,
        summary,
        content: uploadedParagraphs,
        thumbnail,
        createdAt: serverTimestamp(),
        author: "Admin",
    });

    router.push("/admin/crear-blogs");
    };


  return (
    <div className={styles.adminContainer}>
      <Sidebar />
      <div className={styles.content}>
        <h1 className="fw-bold mb-4">{blogId ? "Editar Blog" : "Crear Blog"}</h1>
        <form onSubmit={handleSubmit}>
          <label className="fw-semibold">Título</label>
          <input
            className="form-control mb-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del blog"
          />

          <label className="fw-semibold">Resumen corto</label>
          <textarea
            className="form-control mb-3"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Resumen atractivo"
          />

          <label className="fw-semibold">Contenido del blog</label>
          {paragraphs.map((p, idx) => (
            <div key={idx} className="mb-3">
              {p.type === "text" ? (
                <textarea
                  className="form-control mb-1"
                  rows={4}
                  value={p.content as string}
                  onChange={(e) => handleParagraphChange(idx, e.target.value)}
                  placeholder={`Párrafo ${idx + 1}`}
                />
              ) : (
                <div className="position-relative mb-1">
                  <img
                    src={typeof p.content === "string" ? p.content : URL.createObjectURL(p.content)}
                    alt="Imagen del párrafo"
                    className="img-fluid rounded"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger position-absolute top-0 end-0"
                    onClick={() => removeParagraph(idx)}
                  >
                    X
                  </button>
                </div>
              )}
              <div className="d-flex gap-2 mb-2">
                <input
                  type="file"
                  accept="image/*"
                  className="form-control form-control-sm"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const newParagraphs = [...paragraphs];
                      newParagraphs.splice(idx + 1, 0, { type: "image", content: e.target.files[0] });
                      setParagraphs(newParagraphs);
                    }
                  }}
                />
              </div>
            </div>
          ))}

          <button type="button" className="btn btn-secondary mb-3" onClick={addParagraph}>
            [+] Agregar párrafo
          </button>

          <button type="submit" className="btn btn-primary">
            {blogId ? "Actualizar Blog" : "Publicar Blog"}
          </button>
        </form>
      </div>
    </div>
  );
}
