"use client";

/**
 * LinearLayout - Main application layout
 *
 * Structure:
 * - Fixed header (56px)
 * - Fixed sidebar (240px)
 * - Main content area (scrollable)
 * - Optional chat panel (slide-in from right)
 */

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Target,
  AlertTriangle,
  Clock,
  Settings,
  HelpCircle,
  MessageSquare,
  Search,
  Bell,
  User
} from "lucide-react";
import styles from "./LinearLayout.module.css";

interface LinearLayoutProps {
  children: ReactNode;
  workspaceName?: string;
}

export function LinearLayout({ children, workspaceName = "Framer Q2" }: LinearLayoutProps) {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);

  const navItems = [
    { href: "/workspace", icon: Home, label: "Home" },
    { href: "/workspace/bets", icon: Target, label: "Bets" },
    { href: "/workspace/risks", icon: AlertTriangle, label: "Risks" },
    { href: "/workspace/history", icon: Clock, label: "History" },
  ];

  const bottomNavItems = [
    { href: "/workspace/settings", icon: Settings, label: "Settings" },
    { href: "/workspace/help", icon: HelpCircle, label: "Help" },
  ];

  return (
    <div className={styles.layout}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>⚡</span>
            <span className={styles.logoText}>Aegis</span>
          </div>

          <div className={styles.workspaceSelector}>
            <span className={styles.workspaceName}>{workspaceName}</span>
            <span className={styles.workspaceArrow}>▼</span>
          </div>
        </div>

        <div className={styles.headerCenter}>
          <div className={styles.searchBar}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search bets, risks, actions..."
              className={styles.searchInput}
            />
            <kbd className={styles.searchKbd}>⌘K</kbd>
          </div>
        </div>

        <div className={styles.headerRight}>
          <button className={styles.iconButton}>
            <Bell size={20} />
          </button>
          <button className={styles.iconButton}>
            <User size={20} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <nav className={styles.nav}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarDivider} />

        <nav className={styles.nav}>
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Chat toggle */}
        <button
          className={`${styles.chatToggle} ${chatOpen ? styles.chatToggleActive : ''}`}
          onClick={() => setChatOpen(!chatOpen)}
        >
          <MessageSquare size={16} />
          <span>Chat</span>
        </button>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        {children}
      </main>

      {/* Chat panel (slide-in) */}
      {chatOpen && (
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div className={styles.chatTitle}>
              <MessageSquare size={16} />
              <span>Chat with Aegis</span>
            </div>
            <button
              className={styles.chatClose}
              onClick={() => setChatOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className={styles.chatContent}>
            <p className={styles.chatPlaceholder}>
              Chat interface will be integrated here
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
