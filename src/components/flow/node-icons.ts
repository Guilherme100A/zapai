import {
  Bell,
  Bot,
  Clock,
  CreditCard,
  Flag,
  GitBranch,
  Globe,
  MessageSquare,
  Play,
  ShoppingBag,
  Square,
  Tag,
  Timer,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { NodeType } from "@/lib/flow/node-types";

/**
 * Icone de cada bloco. Fica separado do catalogo porque `node-types.ts` roda
 * tambem no servidor (motor de execucao) e nao deve arrastar componentes React.
 */
export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  start: Play,
  message: MessageSquare,
  await_reply: Timer,
  ai: Bot,
  tags: Tag,
  condition: GitBranch,
  delay: Clock,
  notification: Bell,
  http_request: Globe,
  pix: CreditCard,
  sale: ShoppingBag,
  flow_link: Flag,
  transfer_human: UserCheck,
  end: Square,
};
