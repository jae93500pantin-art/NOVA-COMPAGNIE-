"use client";

import { getSupabaseBrowser } from "./supabase/client";
import type { ChatMessage } from "./types";

/**
 * Realtime messaging helpers (Supabase).
 *
 * These are only active when Supabase is configured. The chat UI keeps its
 * local/mock behaviour otherwise, so the prototype runs with zero setup.
 */

interface DbMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read: boolean;
  created_at: string;
}

function toChatMessage(row: DbMessage, myId: string): ChatMessage {
  return {
    id: row.id,
    fromMe: row.sender_id === myId,
    text: row.body,
    time: new Date(row.created_at).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    read: row.read,
  };
}

/** Load the message history for a conversation. */
export async function fetchMessages(
  conversationId: string,
  myId: string
): Promise<ChatMessage[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as DbMessage[]).map((r) => toChatMessage(r, myId));
}

/** Persist a new message. */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body });
}

/**
 * Subscribe to new messages in a conversation.
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(
  conversationId: string,
  myId: string,
  onInsert: (message: ChatMessage) => void
): () => void {
  const supabase = getSupabaseBrowser();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onInsert(toChatMessage(payload.new as DbMessage, myId));
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
