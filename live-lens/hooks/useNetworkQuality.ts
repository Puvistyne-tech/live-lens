"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "livelens-data-saver";

type NetworkConnection = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function getConnection(): NetworkConnection | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

function isSlowConnection(conn: NetworkConnection | null) {
  if (!conn) return false;
  if (conn.saveData) return true;
  const t = (conn.effectiveType || "").toLowerCase();
  return t === "slow-2g" || t === "2g" || t === "3g";
}

function readDataSaver(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeDataSaver(cb: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("livelens-data-saver", cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("livelens-data-saver", cb);
  };
}

function subscribeConnection(cb: () => void) {
  const conn = getConnection();
  if (!conn?.addEventListener) return () => undefined;
  conn.addEventListener("change", cb);
  return () => conn.removeEventListener?.("change", cb);
}

function readSlow(): boolean {
  return isSlowConnection(getConnection());
}

function readSupported(): boolean {
  return !!getConnection();
}

export function useNetworkQuality() {
  const dataSaver = useSyncExternalStore(subscribeDataSaver, readDataSaver, () => false);
  const isSlow = useSyncExternalStore(subscribeConnection, readSlow, () => false);
  const supported = useSyncExternalStore(subscribeConnection, readSupported, () => false);

  const setDataSaver = useCallback((on: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
      window.dispatchEvent(new Event("livelens-data-saver"));
    } catch {
      /* ignore */
    }
  }, []);

  return {
    dataSaver,
    setDataSaver,
    isSlow,
    supported,
    preferLowQuality: dataSaver || isSlow,
  };
}
