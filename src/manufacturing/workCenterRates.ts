export const getWorkCenterHourlyRate = (workCenter: string) =>
  /quer[eé]taro|\bqro\b/i.test(workCenter) ? 75 : 65;
