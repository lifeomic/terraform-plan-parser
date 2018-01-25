export default function (str: string, search: string): boolean {
  const strLen = str.length;
  return str.substring(strLen - search.length, strLen) === search;
}
