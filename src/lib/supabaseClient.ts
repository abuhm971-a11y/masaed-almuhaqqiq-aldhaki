import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mivzjxzuycbusrapjpos.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_RDKWZjqQlee0oQfTD7JfBQ_lAEf-hJR";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function transcribeImage(file: File): Promise<string> {
  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("transcribe", {
    body: { imageBase64, mimeType: file.type || "image/jpeg" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.text ?? "";
}
