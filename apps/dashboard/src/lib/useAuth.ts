"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

export function useRequireAuth() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "authed">("loading");

  useEffect(() => {
    let mounted = true;
    api
      .me()
      .then(() => {
        if (mounted) setStatus("authed");
      })
      .catch(() => {
        router.replace("/login");
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  return status;
}
