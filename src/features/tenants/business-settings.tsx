import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "./actions";
import { getCurrentTenant } from "./current-tenant";

export async function BusinessSettings() {
  const tenant = await getCurrentTenant();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tenant.name}</CardTitle>
        <CardDescription>
          {tenant.zernioProfileId
            ? "Your account is ready."
            : "Finishing setup. Connecting an account will complete it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
