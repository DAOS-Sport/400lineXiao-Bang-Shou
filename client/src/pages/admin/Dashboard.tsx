import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, Zap, Activity, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FeatureMap {
  [key: string]: number;
}

interface GroupData {
  name: string;
  fullName: string;
  groupId: string;
  features: FeatureMap;
  totalEnabled: number;
}

interface PenetrationData {
  feature: string;
  enabled: number;
  disabled: number;
  rate: number;
}

interface FeatureStats {
  groups: GroupData[];
  featurePenetration: PenetrationData[];
  summary: {
    totalGroups: number;
    totalFeatureSlots: number;
    totalEnabled: number;
    healthRate: number;
  };
}

const FEATURE_COLORS: Record<string, string> = {
  "任務交辦": "#3b82f6",
  "客戶調查": "#10b981",
  "GPS打卡":  "#f59e0b",
  "水質監控": "#06b6d4",
  "天氣預報": "#8b5cf6",
  "風力預報": "#ec4899",
};

const FEATURE_NAMES = ["任務交辦", "客戶調查", "GPS打卡", "水質監控", "天氣預報", "風力預報"];

const DONUT_FEATURES = ["客戶調查", "水質監控", "風力預報"];

function AnimatedKpiCard({
  title,
  value,
  icon: Icon,
  delay,
  colorClass,
  bgClass,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  delay: number;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ y: -5, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.18)" }}
      className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer"
    >
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-4 ${bgClass} rounded-full ${colorClass}`}>
        <Icon size={24} />
      </div>
    </motion.div>
  );
}

interface DonutChartProps {
  data: PenetrationData;
  delay: number;
}

function DonutChart({ data, delay }: DonutChartProps) {
  const color = FEATURE_COLORS[data.feature] || "#3b82f6";
  const chartData = [
    { name: "已啟用", value: data.enabled },
    { name: "未啟用", value: data.disabled },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center"
    >
      <h4 className="text-sm font-semibold text-gray-600 mb-2">{data.feature}</h4>
      <div className="relative">
        <PieChart width={180} height={180}>
          <Pie
            data={chartData}
            cx={90}
            cy={90}
            innerRadius={55}
            outerRadius={80}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-gray-800">{data.rate}%</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {data.enabled} / {data.enabled + data.disabled} 個群組已啟用
      </p>
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
        <p className="font-semibold text-gray-700 mb-2">{label}</p>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: entry.fill }} />
            <span className="text-gray-600">{entry.dataKey}：</span>
            <span className={entry.value === 1 ? "text-green-600 font-medium" : "text-gray-400"}>
              {entry.value === 1 ? "已啟用" : "未啟用"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { data, isLoading, isError, refetch } = useQuery<FeatureStats>({
    queryKey: ["/api/admin/dashboard/feature-stats"],
  });

  if (isLoading) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 bg-gray-50 min-h-screen">
        <Alert variant="destructive" className="max-w-lg">
          <AlertDescription>
            無法載入戰情室資料。請確認已登入，或重新整理頁面。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const barChartData = data.groups.map(g => ({
    name: g.name,
    ...g.features,
  }));

  const donutData = data.featurePenetration.filter(f => DONUT_FEATURES.includes(f.feature));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="p-8 bg-gray-50 min-h-screen"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            className="text-3xl font-bold text-gray-900"
          >
            群組功能戰情室
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-gray-500 mt-1"
          >
            即時監控各 LINE 群組的模組啟用狀態
          </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          whileHover={{ rotate: 180, transition: { duration: 0.3 } }}
          onClick={() => refetch()}
          className="p-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 shadow-sm transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <AnimatedKpiCard
          title="活躍群組總數"
          value={data.summary.totalGroups}
          icon={Users}
          delay={0.1}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <AnimatedKpiCard
          title="總啟用功能數"
          value={data.summary.totalEnabled}
          icon={Zap}
          delay={0.2}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <AnimatedKpiCard
          title="系統健康度"
          value={`${data.summary.healthRate}%`}
          icon={Activity}
          delay={0.3}
          colorClass="text-purple-600"
          bgClass="bg-purple-50"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-800">各群組功能啟用概況</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            共 {data.summary.totalGroups} 個群組
          </span>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickCount={4}
                domain={[0, 6]}
                label={{ value: "啟用功能數", angle: -90, position: "insideLeft", offset: 20, style: { fontSize: 11, fill: "#9ca3af" } }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Legend
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                wrapperStyle={{ paddingTop: 16 }}
              />
              {FEATURE_NAMES.map((feature, index) => (
                <Bar
                  key={feature}
                  dataKey={feature}
                  stackId="a"
                  fill={FEATURE_COLORS[feature]}
                  radius={index === FEATURE_NAMES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationBegin={index * 80}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">關鍵功能滲透率</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            已啟用群組佔比
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {donutData.map((d, i) => (
            <DonutChart key={d.feature} data={d} delay={0.7 + i * 0.1} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
