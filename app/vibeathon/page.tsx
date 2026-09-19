import { CreatePage } from "@/src/features/create/create-page";
import { siteContent } from "@/src/content/site";
import { pageMetadata } from "@/src/lib/metadata";

export const metadata = pageMetadata(siteContent.pages.vibeathon.title, "/vibeathon", siteContent.pages.vibeathon.description);

export default CreatePage;
