"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2, Settings, Plus, ExternalLink } from "lucide-react";

const CONNECTORS = [
  { id: "sap",     name: "SAP S/4HANA / ECC", logo: "SAP",  status: "available", tier: 1, description: "Connect via OData/RFC APIs" },
  { id: "oracle",  name: "Oracle EBS / Cloud", logo: "ORC",  status: "available", tier: 1, description: "REST API & DB link" },
  { id: "jde",     name: "JD Edwards",         logo: "JDE",  status: "available", tier: 1, description: "Orchestrator REST API" },
  { id: "d365",    name: "Microsoft D365",     logo: "D365", status: "available", tier: 1, description: "Dataverse & Finance API" },
  { id: "netsuite",name: "NetSuite",            logo: "NS",   status: "coming",    tier: 2, description: "SuiteQL & REST API" },
  { id: "infor",   name: "Infor CloudSuite",   logo: "INF",  status: "coming",    tier: 2, description: "ION API" },
  { id: "epicor",  name: "Epicor",             logo: "EPC",  status: "coming",    tier: 2, description: "REST API" },
  { id: "sage",    name: "Sage X3",            logo: "SGE",  status: "coming",    tier: 2, description: "Web Services" },
  { id: "csv",     name: "CSV / Excel Upload", logo: "CSV",  status: "connected", tier: 0, description: "Manual file upload" },
  { id: "sftp",    name: "SFTP File Drop",     logo: "FTP",  status: "available", tier: 1, description: "Automated file ingestion" },
  { id: "api",     name: "Generic REST API",   logo: "API",  status: "available", tier: 1, description: "Custom webhook / REST" },
];

export function ConnectorList() {
  const [configuring, setConfiguring] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CONNECTORS.map((c) => (
          <div
            key={c.id}
            className={clsx(
              "bg-white rounded-2xl border p-5 flex flex-col gap-3 transition-all",
              c.status === "connected" ? "border-green-200 bg-green-50/30" : "border-gray-100 hover:border-gray-200"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-bold text-xs text-gray-600">
                  {c.logo}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.description}</p>
                </div>
              </div>
              {c.status === "connected" && (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              )}
            </div>

            <div className="flex items-center justify-between mt-auto">
              <span className={clsx(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                c.status === "connected" ? "bg-green-100 text-green-700" :
                c.status === "available" ? "bg-blue-50 text-blue-600" :
                "bg-gray-100 text-gray-500"
              )}>
                {c.status === "coming" ? "Coming soon" : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
              </span>

              {c.status !== "coming" && (
                <button
                  onClick={() => setConfiguring(c.id)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 transition-colors"
                >
                  {c.status === "connected" ? (
                    <><Settings className="w-3.5 h-3.5" /> Configure</>
                  ) : (
                    <><Plus className="w-3.5 h-3.5" /> Connect</>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
