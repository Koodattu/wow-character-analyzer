import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>Choose a login method to access your dashboard and queue characters for analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <a href={`${API_URL}/api/auth/discord`} className="block">
            <Button className="w-full h-12 text-base gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Continue with Discord
            </Button>
          </a>

          <a href={`${API_URL}/api/auth/battlenet`} className="block">
            <Button className="w-full h-12 text-base gap-2 bg-[#00AEFF] hover:bg-[#0090D0] text-white">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.458 0c.156 0 .296.043.404.128.608.453 1.064 1.273 1.38 2.323.104.36.196.742.272 1.148l.068.41.032.228.152-.06c1.296-.48 2.42-.648 3.272-.456.68.152 1.108.54 1.288 1.112.4 1.264-.352 3.26-1.792 5.42l-.136.196.196.164c1.94 1.648 2.94 3.3 2.736 4.54-.108.652-.516 1.132-1.172 1.376-1.388.52-3.68-.056-6.164-1.404l-.196-.108-.14.184c-1.628 2.1-3.26 3.38-4.632 3.58-.528.076-.964-.044-1.284-.36l-.1-.108-.012.004C3.964 19.616 2.64 20.772.94 21.38l-.076.024.016-.08c.176-.848.5-2.08.872-3.324l.148-.484.164-.528-.2-.004C.828 16.908.22 16.524.06 15.896c-.232-.9.376-2.16 1.584-3.54l.14-.156-.072-.2C.964 9.96.704 8.316.956 7.26c.124-.52.416-.908.86-1.14l.12-.06.004-.136C2 4.456 2.36 3.4 3.02 2.82c.66-.58 1.388-.548 1.992.044l.1.1.164-.112C6.68 1.876 8.48 1.08 9.86.652c.296-.1.46-.12.6-.12z" />
              </svg>
              Continue with Battle.net
            </Button>
          </a>

          <p className="text-xs text-center text-muted-foreground mt-4">Battle.net login also links your WoW characters for easy importing.</p>
        </CardContent>
      </Card>
    </div>
  );
}
