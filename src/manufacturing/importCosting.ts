export type ImportEstimateInput = {
  clientName:string; supplier:string; partNumber:string; description:string; quantity:number;
  country:string; operationType:string; purchaseCurrency:string; invoiceUnitValue:number; purchaseFx:number;
  saleCurrency:string; clientUnitPrice:number; saleFx:number; desiredMarginPercent:number;
  internationalFreight:number; insurance:number; taxes:number; customsAgentFees:number; handling:number;
  domesticTransport:number; otherExpenses:number; logisticsManagement:number;
  // Warranty / support imports bring goods in for another business unit: the merchandise is not charged, only the logistics.
  warranty?:boolean;
};

export type ImportEstimateTotals = {
  merchandiseCost:number; logisticsCost:number; totalCost:number; clientSale:number; profitLoss:number;
  minimumUnitPrice:number; recommendedUnitPrice:number; result:'PROFIT'|'BREAK-EVEN'|'LOSS';
  valueAddedTax:number; totalDisbursement:number;
};
const moneyPrecision=(value:number)=>Math.round((value+Number.EPSILON)*10000)/10000;

export function calculateImportEstimate(input:ImportEstimateInput):ImportEstimateTotals {
  const merchandiseCost=input.warranty?0:input.quantity*input.invoiceUnitValue*input.purchaseFx;
  // IVA is a recoverable tax credit: it is tracked on its own and never enters landed cost, margin or profit / loss.
  const valueAddedTax=input.taxes;
  const logisticsCost=input.internationalFreight+input.insurance+input.customsAgentFees+input.handling+input.domesticTransport+input.otherExpenses+input.logisticsManagement;
  const totalCost=merchandiseCost+logisticsCost;
  const totalDisbursement=totalCost+valueAddedTax;
  const clientSale=input.quantity*input.clientUnitPrice*input.saleFx;
  const profitLoss=clientSale-totalCost;
  const minimumUnitPrice=input.quantity>0&&input.saleFx>0?totalCost/input.quantity/input.saleFx:0;
  const recommendedUnitPrice=minimumUnitPrice*(1+input.desiredMarginPercent/100);
  const result=profitLoss<-.005?'LOSS':profitLoss>.005?'PROFIT':'BREAK-EVEN';
  return{merchandiseCost:moneyPrecision(merchandiseCost),logisticsCost:moneyPrecision(logisticsCost),totalCost:moneyPrecision(totalCost),clientSale:moneyPrecision(clientSale),profitLoss:moneyPrecision(profitLoss),minimumUnitPrice:moneyPrecision(minimumUnitPrice),recommendedUnitPrice:moneyPrecision(recommendedUnitPrice),result,valueAddedTax:moneyPrecision(valueAddedTax),totalDisbursement:moneyPrecision(totalDisbursement)};
}

// IVA depends on the product: a published rate (16, 11, 6 or 0 %) applied to the invoice value in pesos.
// The invoice value is the base even for warranty imports, because customs still levies IVA on the declared goods.
export function calculateImportVat(input:Pick<ImportEstimateInput,'quantity'|'invoiceUnitValue'|'purchaseFx'>,ratePercent:number):number {
  return Math.round(input.quantity*input.invoiceUnitValue*input.purchaseFx*ratePercent)/100;
}
