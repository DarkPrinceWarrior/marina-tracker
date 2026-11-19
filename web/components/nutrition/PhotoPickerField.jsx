import React, { useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import api from "../../api.js";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось обработать изображение."));
    img.src = src;
  });
}

export async function compressImageFileToDataUrl(
  file,
  { maxSide = 900, quality = 0.82 } = {},
) {
  const rawUrl = await readFileAsDataUrl(file);
  try {
    const img = await loadImage(rawUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return rawUrl;

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return rawUrl;

    ctx.fillStyle = "#F3F4F7";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const compressed = canvas.toDataURL("image/jpeg", quality);
    if (compressed && compressed.startsWith("data:image/jpeg;base64,")) {
      return compressed;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export default function PhotoPickerField({
  label = "Фотография блюда",
  photoUrl = "",
  inheritedPhotoUrl = "",
  onChange,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const hasOwnPhoto = Boolean(photoUrl);
  const previewUrl = photoUrl || inheritedPhotoUrl || "";
  const isInherited = !hasOwnPhoto && Boolean(inheritedPhotoUrl);

  const handleTrigger = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type && !file.type.startsWith("image/")) {
      setUploadError("Выберите фотографию (JPEG, PNG или WebP).");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxSide: 900,
        quality: 0.82,
      });
      const res = await api.uploadNutritionPhoto(dataUrl);
      if (res?.url) {
        onChange?.(res.url);
      } else {
        throw new Error("Сервер не вернул ссылку на фотографию.");
      }
    } catch (err) {
      setUploadError(err?.message || "Не удалось загрузить фотографию.");
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    if (disabled || uploading) return;
    setUploadError("");
    onChange?.("");
  };

  return (
    <div className="mt-field">
      <span className="mt-label">{label}</span>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="mt-sr-only"
        aria-label="Выбрать фотографию блюда"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />

      {previewUrl ? (
        <div className="dish-photo-picker">
          <div className="dish-photo-preview-frame">
            <img
              src={previewUrl}
              alt="Фото блюда"
              className="dish-photo-preview-img"
            />
            {isInherited ? (
              <span className="dish-photo-badge">Фото из меню</span>
            ) : null}
          </div>

          <div className="dish-photo-actions">
            <button
              type="button"
              className="mt-btn mt-btn--secondary mt-btn--sm"
              style={{ flex: 1 }}
              disabled={disabled || uploading}
              onClick={handleTrigger}
            >
              <Camera size={15} />
              <span>
                {uploading
                  ? "Загружаем…"
                  : isInherited
                    ? "Своё фото"
                    : "Заменить фото"}
              </span>
            </button>

            {hasOwnPhoto ? (
              <button
                type="button"
                className="mt-btn mt-btn--danger mt-btn--sm"
                disabled={disabled || uploading}
                onClick={handleClear}
                aria-label="Убрать фотографию"
              >
                <Trash2 size={15} />
                <span>Убрать</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="dish-photo-dropzone"
          disabled={disabled || uploading}
          onClick={handleTrigger}
        >
          <span className="dish-photo-dropzone-icon" aria-hidden="true">
            <ImagePlus size={20} />
          </span>
          <span className="dish-photo-dropzone-text">
            <strong>
              {uploading ? "Загружаем фото…" : "Прикрепить фото блюда"}
            </strong>
            <span>Камера или галерея телефона</span>
          </span>
        </button>
      )}

      {uploadError ? <div className="mt-form-error">{uploadError}</div> : null}
    </div>
  );
}
