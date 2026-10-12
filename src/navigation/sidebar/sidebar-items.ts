import { Banknote, ChartBar, Gauge, LayoutDashboard, ListTodo, type LucideIcon } from "lucide-react";
import type { Route } from "next";

import { route } from "@/features/common/route";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: Route;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: Route;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    items: [
      {
        id: "default",
        title: "Default",
        url: route("/dashboard/default"),
        icon: LayoutDashboard,
      },
      {
        id: "crm",
        title: "CRM",
        url: route("/dashboard/crm"),
        icon: ChartBar,
      },
      {
        id: "finance",
        title: "Finance",
        url: route("/dashboard/finance"),
        icon: Banknote,
      },
      {
        id: "analytics",
        title: "Analytics",
        url: route("/dashboard/analytics"),
        icon: Gauge,
      },
      {
        id: "productivity",
        title: "Productivity",
        url: route("/dashboard/productivity"),
        icon: ListTodo,
      },
    ],
  },
];
