import { NextRequest, NextResponse } from "next/server";

import { db, eq, schema, sql } from "@projectx/db";

import { env } from "@/env";
import { connectorFacade, toConnectorEnv } from "@/lib/connector";

export async function POST(req: NextRequest) {
  // get the bearer token from the header
  const authToken = (req.headers.get("authorization") || "")
    .split("Bearer ")
    .at(1);

  // if not found OR the bearer token does NOT equal the CRON_SECRET
  // TODO: Later we'll add the 2nd part of condition authToken !== env.CRON_SECRET
  if (!authToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
      },
    );
  }

  // if token exists then move on with the cron job
  try {
    console.log("✓ [cron]: Handling cron update-integrations");

    await handleEvent();

    console.log("✓ [cron]: Handled cron update-integrations");
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(`❌ [cron] Error when handling cron: ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const handleEvent = async () => {
  const facade = await connectorFacade(toConnectorEnv(env.NODE_ENV));

  // get active country codes
  const countries = await db
    .select()
    .from(schema.country)
    .where(eq(schema.country.active, true));

  // list all providers for connected connectors
  const integrationList = await facade.listIntegrations(countries);
  console.debug(`○ [cron] upsert ${integrationList.length} integrations`);

  // TODO: handle removed connector providers

  // TODO: handle update only delta

  // upsert integrations
  await db
    .insert(schema.integration)
    .values(integrationList)
    .onConflictDoUpdate({
      target: schema.integration.id,
      set: {
        connectorProviderId: sql`connector_provider_id`,
        connectorId: sql`connector_id`,
        name: sql`name`,
        logoUrl: sql`logo_url`,
        updatedAt: sql`updated_at`,
      },
    });
};
