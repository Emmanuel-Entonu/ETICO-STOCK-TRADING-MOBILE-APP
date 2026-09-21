import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'

// Bucket that holds KYC verification selfies. It is PRIVATE — RLS lets a user
// write/read only their own `<userId>/…` folder; the partner dashboard reads
// via a service-role signed URL. See supabase/kyc-selfie.sql.
const BUCKET = 'kyc-selfies'

/**
 * Upload a KYC selfie (a local file URI from the camera) to Supabase Storage
 * under the user's own folder, and return the stored object path. Overwrites any
 * previous selfie (a redo of KYC replaces it). The caller persists this path on
 * `profiles.selfie_path`.
 */
export async function uploadKycSelfie(uri: string, userId: string): Promise<string> {
  // Read the captured JPEG as base64, then decode to an ArrayBuffer — the
  // reliable way to hand binary to supabase-js from React Native.
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  const bytes = decode(base64)

  const path = `${userId}/selfie.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(error.message)
  return path
}
