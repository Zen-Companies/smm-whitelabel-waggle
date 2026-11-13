import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { CircleCheck } from "lucide-react";
import { BrandMark } from "@/components/app/platform-mark";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import type { Integration } from "@/lib/social/types";
import { DisconnectSite, SiteKeysForm, WhatsAppKeysForm } from "./own-key-forms";
import { EmailConnectForm, LineKeysForm } from "./email-line-forms";
import { CONNECTED_PLATFORMS, isOwnKeyPlatform, MORE_CONNECTIONS } from "./own-keys";

/**
 * Settings → Accounts → More connections (T80): groups under the social tiles. Sites connect
 * with the owner's own keys, typed here; the rest say Coming soon. Owners and admins only
 * (the caller checks accounts.manage).
 */
export async function MoreConnections() {
  const tenant = await getCurrentTenant();
  let connected: Integration[] = [];
  let unavailable = false;
  if (tenant.zernioProfileId) {
    try {
      connected = await getSocialProvider().listIntegrations({
        profileId: tenant.zernioProfileId,
        platforms: CONNECTED_PLATFORMS,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "listIntegrations" } });
      unavailable = true;
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="more-heading">
      <div>
        <h3 id="more-heading" className="text-[15px] font-semibold">
          More connections
        </h3>
        <p className="meta">Messaging, email, your website and shop, ads and business tools.</p>
      </div>
      {unavailable && (
        <p className="danger-box">Your connected sites couldn&apos;t be loaded right now.</p>
      )}
      {MORE_CONNECTIONS.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          <h4 className="text-ink-2 text-sm font-semibold">{group.title}</h4>
          <ul className="card divide-line flex flex-col divide-y">
            {group.items.map((item) => {
              const mine = connected.filter((c) => c.platform === (item.platform ?? item.id));
              return (
                <li key={item.id} className="flex flex-col px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <BrandMark brand={item.id} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="font-semibold">{item.label}</b>
                      <span className="text-ink-2 text-[13px]">{item.line}</span>
                    </span>
                    {item.how === "soon" && <span className="text-ink-3 text-sm">Coming soon</span>}
                    {item.how === "link" && item.href && (
                      <Link
                        href={item.href}
                        className="text-honey-text text-sm font-medium underline"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                  {mine.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center gap-3 pt-2 pl-11 text-sm"
                    >
                      <span className="inline-flex flex-1 items-center gap-1.5">
                        <CircleCheck
                          className="text-success size-4"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        {c.name}
                      </span>
                      <DisconnectSite id={c.id} label={c.name} />
                    </div>
                  ))}
                  {isOwnKeyPlatform(item.id) && !mine.length && (
                    <details className="pl-11">
                      <summary className="text-honey-text cursor-pointer text-sm font-medium">
                        Connect with your own key
                      </summary>
                      <SiteKeysForm kind={item.id} />
                    </details>
                  )}
                  {item.how === "email" && (
                    <details className="pl-11">
                      <summary className="text-honey-text cursor-pointer text-sm font-medium">
                        {mine.length ? "Connect another email" : "Connect an email"}
                      </summary>
                      <EmailConnectForm />
                    </details>
                  )}
                  {item.how === "line" && !mine.length && (
                    <details className="pl-11">
                      <summary className="text-honey-text cursor-pointer text-sm font-medium">
                        Connect with your channel keys
                      </summary>
                      <LineKeysForm />
                    </details>
                  )}
                </li>
              );
            })}
            {group.title === "Messaging" && (
              <li className="flex flex-col px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <BrandMark brand="whatsapp" size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="font-semibold">WhatsApp: use my own Meta keys</b>
                    <span className="text-ink-2 text-[13px]">
                      Advanced. For a number already set up in Meta Business.
                    </span>
                  </span>
                </div>
                <details className="pl-11">
                  <summary className="text-honey-text cursor-pointer text-sm font-medium">
                    Connect with my keys
                  </summary>
                  <WhatsAppKeysForm />
                </details>
              </li>
            )}
          </ul>
        </div>
      ))}
    </section>
  );
}
