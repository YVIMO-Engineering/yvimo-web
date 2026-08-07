export type ImportEstimateInput = {
  clientName:string; supplier:string; partNumber:string; description:string; quantity:number;
  country:string; operationType:string; purchaseCurrency:string; invoiceUnitValue:number; purchaseFx:number;
  saleCurrency:string; clientUnitPrice:number; saleFx:number; desiredMarginPercent:number;
  internationalFreight:number; insurance:number; taxes:number; customsAgentFees:number; handling:number;
  domesticTransport:number; otherExpenses:number; logisticsManagement:number;
};

export type ImportEstimateTotals = {
  merchandiseCost:number; logisticsCost:number; totalCost:number; clientSale:number; profitLoss:number;
  minimumUnitPrice:number; recommendedUnitPrice:number; result:'PROFIT'|'BREAK-EVEN'|'LOSS';
};
const moneyPrecision=(value:number)=>Math.round((value+Number.EPSILON)*10000)/10000;

export function calculateImportEstimate(input:ImportEstimateInput):ImportEstimateTotals {
  const merchandiseCost=input.quantity*input.invoiceUnitValue*input.purchaseFx;
  const logisticsCost=input.internationalFreight+input.insurance+input.taxes+input.customsAgentFees+input.handling+input.domesticTransport+input.otherExpenses+input.logisticsManagement;
  const totalCost=merchandiseCost+logisticsCost;
  const clientSale=input.quantity*input.clientUnitPrice*input.saleFx;
  const profitLoss=clientSale-totalCost;
  const minimumUnitPrice=input.quantity>0&&input.saleFx>0?totalCost/input.quantity/input.saleFx:0;
  const recommendedUnitPrice=minimumUnitPrice*(1+input.desiredMarginPercent/100);
  const result=profitLoss<-.005?'LOSS':profitLoss>.005?'PROFIT':'BREAK-EVEN';
  return{merchandiseCost:moneyPrecision(merchandiseCost),logisticsCost:moneyPrecision(logisticsCost),totalCost:moneyPrecision(totalCost),clientSale:moneyPrecision(clientSale),profitLoss:moneyPrecision(profitLoss),minimumUnitPrice:moneyPrecision(minimumUnitPrice),recommendedUnitPrice:moneyPrecision(recommendedUnitPrice),result};
}
