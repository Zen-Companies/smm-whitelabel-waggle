import { leadsCsvResponse } from "@/features/leads";

// T74d: "Download list" on the Leads board.
export async function GET() {
  return leadsCsvResponse();
}
