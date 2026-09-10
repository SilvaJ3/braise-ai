import { useRef, useState } from 'react'
import { useUpdateEntry } from '../lib/entries'
import { INSTAGRAM_ENABLED } from '../lib/featureFlags'
import { entryImageUrl, uploadEntryImage, useInstagramAccount, usePublishEntryNow } from '../lib/instagram'
import type { ContentEntry } from '../lib/supabase'

// Actions Instagram sur une entrée du planning : photo (requise) + publication immédiate.
// N'affiche rien si l'entrée n'est pas sur Instagram, ou tant que la fonctionnalité est cachée
// (proto : app Meta en mode dev, voir ROADMAP.md).
export default function InstagramActions({ entry }: { entry: ContentEntry }) {
  const { data: account } = useInstagramAccount()
  const update = useUpdateEntry()
  const publish = usePublishEntryNow()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  if (!INSTAGRAM_ENABLED || entry.platform !== 'instagram') return null

  async function onFile(f: File | null) {
    if (!f) return
    setUploading(true)
    try {
      const path = await uploadEntryImage(entry.id, f)
      await update.mutateAsync({ id: entry.id, patch: { image_path: path } })
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="stack" style={{ marginTop: 8 }}>
      {!account && (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Instagram non connecté (Compte → Instagram) — publication manuelle uniquement.
        </p>
      )}

      {entry.image_path ? (
        <img
          src={entryImageUrl(entry.image_path)}
          alt=""
          style={{ maxHeight: 140, borderRadius: 8, objectFit: 'cover' }}
        />
      ) : (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Aucune photo — obligatoire pour publier sur Instagram.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      <div className="row">
        <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Envoi…' : entry.image_path ? 'Changer la photo' : 'Ajouter une photo'}
        </button>

        {account && entry.image_path && entry.status !== 'publie' && (
          <button
            type="button"
            className="primary"
            disabled={publish.isPending}
            onClick={() => publish.mutate(entry.id)}
          >
            {publish.isPending ? 'Publication…' : 'Publier maintenant'}
          </button>
        )}
      </div>

      {entry.publish_status === 'erreur' && (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Échec : {entry.publish_error}
        </p>
      )}
      {entry.ig_media_id && (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Publié sur Instagram ✓
        </p>
      )}
    </div>
  )
}
