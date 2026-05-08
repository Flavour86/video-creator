import { getRequestConfig } from "next-intl/server";

import { dictionaries } from "@/lib/i18n/messages";

export default getRequestConfig(async () => ({
  locale: "en",
  messages: dictionaries.en,
  timeZone: "UTC",
}));
