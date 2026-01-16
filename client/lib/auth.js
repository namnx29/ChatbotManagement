"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function isAuthenticatedClient() {
  if (typeof window === "undefined") return false;
  const userEmail = localStorage.getItem("userEmail");
  const accountId = localStorage.getItem("accountId");
  return Boolean(userEmail && accountId);
}

export function usePublicPageGuard(redirectTo = "/dashboard") {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isAuthenticatedClient()) {
      router.replace(redirectTo);
    } else {
      setIsChecking(false);
    }
  }, [router, redirectTo]);

  return { isChecking };
}