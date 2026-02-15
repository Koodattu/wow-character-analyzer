"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const [data, setData] = useState<string>("Loading...");

  const fetchGreeting = async () => {
    // Eden Treaty provides the autocomplete here:
    const { data, error } = await api.index.get();

    if (!error) {
      setData(data.message);
    }
  };

  useEffect(() => {
    fetchGreeting();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">
          Backend says: <span className="text-blue-500">{data}</span>
        </h1>
      </div>

      <button
        onClick={async () => {
          // This will be fully typed! Try changing 'name' to something else.
          const { data } = await api.user.post({ name: "Bun User" });
          alert(`Created user: ${data?.name}`);
        }}
        className="mt-8 px-4 py-2 bg-black text-white rounded-lg"
      >
        Test Typed Post
      </button>
    </main>
  );
}
