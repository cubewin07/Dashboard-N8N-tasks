import {
  Briefcase,
  Calculator,
  Camera,
  ChartColumn,
  Headset,
  Megaphone,
  Package,
  Palette,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** Department icons the boss can pick: the `icon` field stores one of these lucide names. */
export const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  Headset,
  Megaphone,
  Palette,
  Calculator,
  Truck,
  Package,
  Warehouse,
  Store,
  ShoppingCart,
  Briefcase,
  Users,
  Wrench,
  ChartColumn,
  Camera,
}

export const DEPARTMENT_ICON_NAMES = Object.keys(DEPARTMENT_ICONS)
