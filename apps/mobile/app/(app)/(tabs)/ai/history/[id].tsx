import { useEffect, useState } from 'react';
import { FlatList, Text, View, type ListRenderItemInfo } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getMessages } from '@/src/db/repositories/messages';
import { getSession } from '@/src/db/repositories/sessions';
import { getVehicle } from '@/src/db/repositories/vehicles';
import type { Message, Session, Vehicle } from '@/src/db/schema';

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isToolResult = msg.role === 'tool';

  if (isToolResult) {
    return (
      <View className="mb-2 mx-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">TOOL RESULT</Text>
        <Text className="mt-1 text-xs text-zinc-400" numberOfLines={3}>{msg.content}</Text>
      </View>
    );
  }

  return (
    <View className={`mb-3 px-4 ${isUser ? 'items-end' : 'items-start'}`}>
      <View
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser ? 'rounded-tr-sm bg-cyan-500' : 'rounded-tl-sm border border-zinc-800 bg-zinc-900'
        }`}
      >
        <Text className={`text-sm leading-5 ${isUser ? 'text-zinc-950' : 'text-zinc-100'}`}>
          {msg.content}
        </Text>
      </View>
      <Text className="mt-0.5 text-[10px] text-zinc-600">
        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

function renderMessage({ item }: ListRenderItemInfo<Message>) {
  return <MessageBubble msg={item} />;
}

function SessionHeader({ session, vehicle }: { session: Session; vehicle: Vehicle | null }) {
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || vehicle.id
    : null;

  return (
    <View className="mx-4 mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <Text className="text-[10px] font-bold tracking-[2px] text-zinc-500">SESSION</Text>
      <Text className="mt-2 text-sm font-semibold text-zinc-100">
        {new Date(session.created_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
      {vehicleLabel ? (
        <Text className="mt-1 text-xs text-zinc-500">{vehicleLabel}</Text>
      ) : null}
    </View>
  );
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!id) return;

    async function load() {
      const [sess, msgs] = await Promise.all([
        getSession(db, id),
        getMessages(db, id),
      ]);
      setSession(sess);
      setMessages(msgs);
      if (sess?.vehicle_id) {
        const v = await getVehicle(db, sess.vehicle_id);
        setVehicle(v);
      }
    }

    load();
  }, [db, id]);

  return (
    <FlatList
      className="flex-1 bg-[#08080a]"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
      data={messages}
      keyExtractor={(item) => item.id}
      renderItem={renderMessage}
      ListHeaderComponent={session ? <SessionHeader session={session} vehicle={vehicle} /> : null}
      ListEmptyComponent={
        <View className="items-center justify-center px-6 py-12">
          <Text className="text-center text-sm text-zinc-500">No messages in this session.</Text>
        </View>
      }
    />
  );
}
