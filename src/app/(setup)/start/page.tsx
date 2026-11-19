import { redirect } from "next/navigation";

// The plan step before setup (18 Nov) ended with the Free plan (19 Nov): new accounts start on
// Free and go straight into setup. Old links land on the first screen.
export default function StartPage() {
  redirect("/welcome");
}
