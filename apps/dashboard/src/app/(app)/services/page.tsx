"use client";

import { ServiceTable } from "@/components/ServiceTable";
import { useDashboardStore } from "@/lib/store";

export default function ServicesPage() {
  const servers = useDashboardStore((s) => Object.values(s.servers));

  return (
    <>
      <h1 className="mb-4 text-lg font-semibold text-white">All Services</h1>
      <ServiceTable servers={servers} />
    </>
  );
}
