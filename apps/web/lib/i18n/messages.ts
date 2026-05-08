import en from "./messages/en.json";
import zh from "./messages/zh.json";

export const dictionaries = {
  en,
  zh,
} as const;

export type MessageLocale = keyof typeof dictionaries;
export type Messages = (typeof dictionaries)[MessageLocale];

export function getMessages(locale: MessageLocale): Messages {
  return dictionaries[locale];
}
