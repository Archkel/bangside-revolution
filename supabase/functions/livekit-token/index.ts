import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Sign in required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitSecret = Deno.env.get("LIVEKIT_API_SECRET");

  if (
    !supabaseUrl || !supabaseKey || !livekitUrl ||
    !livekitKey || !livekitSecret
  ) {
    return respond({ error: "Server configuration incomplete" }, 500);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError || !userData.user) {
      return respond({ error: "Invalid or expired session" }, 401);
    }

    const body = await req.json();
    const roomId = body?.roomId;

    if (typeof roomId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId)) {
      return respond({ error: "Valid roomId required" }, 400);
    }

    // Uses the caller's session and existing RLS room-access policy.
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", roomId)
      .maybeSingle();

    if (roomError) {
      return respond({ error: "Could not verify room access" }, 403);
    }
    if (!room) {
      return respond({ error: "Room not found or access denied" }, 403);
    }

    const roomName = `BangsideRevolution-${room.id}`;
    const token = new AccessToken(livekitKey, livekitSecret, {
      identity: userData.user.id,
      ttl: "10m",
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    return respond({
      serverUrl: livekitUrl,
      participantToken: await token.toJwt(),
      roomName,
    });
  } catch {
    return respond({ error: "Could not create call token" }, 500);
  }
});
