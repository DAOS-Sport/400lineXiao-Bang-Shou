import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KeepAlive } from "@/components/KeepAlive";
import NotFound from "@/pages/not-found";
import Login from "@/pages/admin/Login";
import Dashboard from "@/pages/admin/Dashboard";
import AdminGuard from "@/components/AdminGuard";
import AdminLayout from "@/components/AdminLayout";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/admin/dashboard" />
      </Route>
      <Route path="/admin">
        <Redirect to="/admin/dashboard" />
      </Route>
      <Route path="/admin/login" component={Login} />
      <Route path="/admin/dashboard">
        <AdminGuard>
          <AdminLayout>
            <Dashboard />
          </AdminLayout>
        </AdminGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <KeepAlive />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
