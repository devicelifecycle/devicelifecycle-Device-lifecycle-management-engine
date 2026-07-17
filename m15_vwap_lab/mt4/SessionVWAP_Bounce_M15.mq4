//+------------------------------------------------------------------+
//| SessionVWAP_Bounce_M15.mq4                                       |
//| Research EA — Shannon-style session VWAP bounce (M15)            |
//|                                                                  |
//| VALIDATION STATUS (Dukascopy M15, 2020-01 → 2026-07):             |
//|   Backtest + 1,000,000-path Monte Carlo = FAIL gate.             |
//|   Do NOT enable live trading. Paper/demo study only.             |
//|   See m15_vwap_lab/RESEARCH.md and results/final_report.json     |
//|                                                                  |
//| Design (from research, not curve-fit toys):                      |
//|  - Session VWAP: who is in control (Shannon / CMT)               |
//|  - Buy bounce not touch; EMA200 + EMA50 alignment                |
//|  - Rising ADX 18-40; London/NY overlap 12-16 GMT                 |
//|  - Fixed fractional risk; NO martingale / hedge / recovery       |
//|  - One symbol, one position, one trade per day                   |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Session VWAP Bounce M15 — RESEARCH/PAPER ONLY (MC FAIL)"

input bool   AllowLiveTrading     = false; // KEEP FALSE until independent PASS validation
input double RiskPercent          = 0.50;
input double MaxDailyDDPercent    = 3.00;
input double SL_ATR_Mult          = 1.50;
input double TP_RR                = 2.50;
input int    MaxBarsInTrade       = 32;
input int    ATR_Period           = 14;
input int    EMA_Fast             = 50;
input int    EMA_Slow             = 200;
input int    ADX_Period           = 14;
input double ADX_Min              = 18.0;
input double ADX_Max              = 40.0;
input int    SessionStartGMT      = 12;
input int    SessionEndGMT        = 16;
input int    BrokerGMTOffset      = 0;     // broker hour - GMT
input int    MagicNumber          = 260717;
input int    Slippage             = 30;
input bool   DebugMode            = true;

datetime gLastBar = 0;
int      gDayKey  = -1;
double   gDayEq   = 0;
int      gTradesToday = 0;

int GMTHour()
{
   int h = TimeHour(TimeCurrent()) - BrokerGMTOffset;
   while(h < 0) h += 24;
   while(h >= 24) h -= 24;
   return h;
}

int DayKey(){ return (int)(TimeCurrent()/86400); }

double SessionVWAP()
{
   // Reset at GMT midnight approx via broker day boundary
   datetime dayStart = TimeCurrent() - (TimeCurrent() % 86400);
   double pv=0, vv=0;
   int bars = iBars(Symbol(), PERIOD_M15);
   for(int i=1; i<bars; i++)
   {
      datetime t = iTime(Symbol(), PERIOD_M15, i);
      if(t < dayStart) break;
      double tp = (iHigh(Symbol(),PERIOD_M15,i)+iLow(Symbol(),PERIOD_M15,i)+iClose(Symbol(),PERIOD_M15,i))/3.0;
      double v  = (double)iVolume(Symbol(),PERIOD_M15,i);
      if(v<=0) v=1;
      pv += tp*v; vv += v;
   }
   if(vv<=0) return 0;
   return pv/vv;
}

bool HasOpen()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES)) continue;
      if(OrderMagicNumber()!=MagicNumber) continue;
      if(OrderSymbol()!=Symbol()) continue;
      int t=OrderType();
      if(t==OP_BUY||t==OP_SELL) return true;
   }
   return false;
}

double CalcLot(double price, double sl)
{
   double eq = AccountEquity();
   double riskMoney = eq * RiskPercent / 100.0;
   double ts = MarketInfo(Symbol(), MODE_TICKSIZE);
   double tv = MarketInfo(Symbol(), MODE_TICKVALUE);
   double step = MarketInfo(Symbol(), MODE_LOTSTEP);
   double minL = MarketInfo(Symbol(), MODE_MINLOT);
   double maxL = MarketInfo(Symbol(), MODE_MAXLOT);
   if(ts<=0||tv<=0||step<=0) return 0;
   double dist = MathAbs(price-sl);
   if(dist<=0) return 0;
   double lot = riskMoney / ((dist/ts)*tv);
   lot = MathFloor(lot/step)*step;
   if(lot < minL) return 0;
   if(lot > maxL) lot = maxL;
   return NormalizeDouble(lot, 2);
}

bool InSession()
{
   int h = GMTHour();
   if(TimeDayOfWeek(TimeCurrent())==5 && h>=15) return false;
   return (h>=SessionStartGMT && h<SessionEndGMT);
}

bool Signal(int &dir)
{
   dir = -1;
   if(!InSession()) return false;
   double vwap = SessionVWAP();
   if(vwap<=0) return false;
   double atr = iATR(Symbol(), PERIOD_M15, ATR_Period, 1);
   double emaF = iMA(Symbol(), PERIOD_M15, EMA_Fast, 0, MODE_EMA, PRICE_CLOSE, 1);
   double emaS = iMA(Symbol(), PERIOD_M15, EMA_Slow, 0, MODE_EMA, PRICE_CLOSE, 1);
   double adx1 = iADX(Symbol(), PERIOD_M15, ADX_Period, PRICE_CLOSE, MODE_MAIN, 1);
   double adx4 = iADX(Symbol(), PERIOD_M15, ADX_Period, PRICE_CLOSE, MODE_MAIN, 4);
   double c1 = iClose(Symbol(), PERIOD_M15, 1);
   double o1 = iOpen(Symbol(), PERIOD_M15, 1);
   double c2 = iClose(Symbol(), PERIOD_M15, 2);
   double l2 = iLow(Symbol(), PERIOD_M15, 2);
   double h2 = iHigh(Symbol(), PERIOD_M15, 2);
   if(atr<=0||emaF<=0||emaS<=0||adx1<=0) return false;
   if(adx1<ADX_Min || adx1>ADX_Max) return false;
   if(adx1<adx4) return false;
   bool touched = (l2<=vwap && h2>=vwap);
   if(!touched) return false;
   double reclaim = 0.15*atr;
   // VWAP slope proxy: current day VWAP vs price path via EMA50 vs prior
   double vwapPrev = vwap; // approximate: require close vs ema structure
   if(c1>emaS && emaF>emaS && c1>vwap+reclaim && c1>o1 && c2<=vwap)
   {
      dir = OP_BUY; return true;
   }
   if(c1<emaS && emaF<emaS && c1<vwap-reclaim && c1<o1 && c2>=vwap)
   {
      dir = OP_SELL; return true;
   }
   return false;
}

int OnInit()
{
   if(!AllowLiveTrading)
      Print("SessionVWAP_Bounce: AllowLiveTrading=false — orders blocked. Research EA only.");
   else
      Alert("WARNING: Live trading enabled on an EA that FAILED 6y backtest + 1M Monte Carlo validation.");
   gDayEq = AccountEquity();
   gDayKey = DayKey();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason){ Comment(""); }

void ManageExit()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES)) continue;
      if(OrderMagicNumber()!=MagicNumber) continue;
      if(OrderSymbol()!=Symbol()) continue;
      int type=OrderType(); if(type!=OP_BUY&&type!=OP_SELL) continue;
      int bars = (int)((TimeCurrent()-OrderOpenTime())/(15*60));
      if(bars>=MaxBarsInTrade)
      {
         double px = (type==OP_BUY)?MarketInfo(Symbol(),MODE_BID):MarketInfo(Symbol(),MODE_ASK);
         OrderClose(OrderTicket(), OrderLots(), px, Slippage, clrOrange);
      }
   }
}

void OnTick()
{
   ManageExit();
   if(DayKey()!=gDayKey){ gDayKey=DayKey(); gDayEq=AccountEquity(); gTradesToday=0; }
   if(gDayEq>0 && 100.0*(gDayEq-AccountEquity())/gDayEq >= MaxDailyDDPercent) return;

   datetime bar = iTime(Symbol(), PERIOD_M15, 0);
   if(bar==gLastBar) return;
   gLastBar = bar;

   string dash = "SessionVWAP M15 RESEARCH\nAllowLive="+IntegerToString((int)AllowLiveTrading)+
                 "\nStatus=MC_FAIL_DO_NOT_LIVE\nGMT="+IntegerToString(GMTHour())+
                 "\nTradesToday="+IntegerToString(gTradesToday);
   Comment(dash);

   if(!AllowLiveTrading) return;
   if(!IsTradeAllowed()) return;
   if(HasOpen()) return;
   if(gTradesToday>=1) return;

   int dir=-1;
   if(!Signal(dir)) return;

   double atr = iATR(Symbol(), PERIOD_M15, ATR_Period, 1);
   if(atr<=0) return;
   RefreshRates();
   double price = (dir==OP_BUY)?Ask:Bid;
   double sl = (dir==OP_BUY)?(price-SL_ATR_Mult*atr):(price+SL_ATR_Mult*atr);
   double tp = (dir==OP_BUY)?(price+SL_ATR_Mult*atr*TP_RR):(price-SL_ATR_Mult*atr*TP_RR);
   double lot = CalcLot(price, sl);
   if(lot<=0){ if(DebugMode) Print("No safe lot"); return; }
   int ticket = OrderSend(Symbol(), dir, lot, price, Slippage, sl, tp, "VWAP_Bounce_Research", MagicNumber, 0,
                          (dir==OP_BUY?clrDodgerBlue:clrRed));
   if(ticket>0){ gTradesToday++; Print("OPENED research trade #",ticket); }
   else Print("OrderSend failed ", GetLastError());
}
//+------------------------------------------------------------------+
