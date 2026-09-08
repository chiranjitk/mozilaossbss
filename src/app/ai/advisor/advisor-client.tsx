// =====================================================================
// AI ADVISOR CLIENT — chat interface with LLM
// =====================================================================

"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, Send, Sparkles, User, Loader2, Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const SUGGESTIONS = [
  "How do I handle a subscriber with overdue invoices?",
  "What RADIUS attributes should I configure for bandwidth limiting?",
  "My NAS is showing high CPU — what should I check?",
  "How do I set up a new DHCP subnet for subscribers?",
  "What's the best approach for churn prevention?",
];

export function AdvisorClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: async ({ message, convId }: { message: string; convId?: string }) => {
      const res = await fetch("/api/v1/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId: convId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? "Failed to get AI response");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(data.data.messages);
      setConversationId(data.data.conversationId);
      setInput("");
    },
    onError: (e: Error) => toast.error("AI unavailable", { description: e.message }),
  });

  const handleSend = (text?: string) => {
    const message = text ?? input;
    if (!message.trim() || chatMutation.isPending) return;

    // Optimistically add user message
    const userMsg: ChatMessage = { role: "user", content: message, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    chatMutation.mutate({ message, convId: conversationId ?? undefined });
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setInput("");
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      <PageHeader
        title="AI Advisor"
        description="Ask questions about subscribers, billing, network, RADIUS, and operations. Powered by AI."
        actions={
          <Button variant="outline" size="sm" onClick={handleNewConversation}>
            <Plus className="mr-2 h-3.5 w-3.5" /> New Chat
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Chat area */}
        <div className="lg:col-span-3">
          <Card className="flex flex-col h-[600px]">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-thin p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Cryptsk AI Advisor</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Ask me about subscriber management, RADIUS configuration, billing, network issues, or any platform feature.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      msg.role === "assistant" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground"
                    )}>
                      {msg.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className={cn(
                      "rounded-lg px-4 py-2.5 max-w-[80%]",
                      msg.role === "assistant" ? "bg-muted/40" : "bg-brand text-brand-foreground"
                    )}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg bg-muted/40 px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask the AI Advisor anything…"
                  rows={1}
                  className="resize-none min-h-[40px] max-h-32"
                  disabled={chatMutation.isPending}
                />
                <Button
                  size="icon"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || chatMutation.isPending}
                  className="h-10 w-10 shrink-0"
                >
                  {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold">AI Advisor</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                The AI Advisor can help you with:
              </p>
              <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-4">
                <li>Subscriber troubleshooting</li>
                <li>RADIUS/AAA configuration</li>
                <li>Billing & payment guidance</li>
                <li>Network diagnostics</li>
                <li>Operational best practices</li>
                <li>Policy & QoS setup</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-muted/20 border-dashed">
            <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Note</p>
              <p>
                AI responses are generated using the z-ai-web-dev-sdk LLM.
                If the AI service is unavailable, a fallback response is provided.
                AI never blocks core platform functionality.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
