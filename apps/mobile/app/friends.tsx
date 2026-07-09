/**
 * Friends — Step 9 of Phase 1.
 *
 * Friends graph management: accepted friends, incoming requests (accept /
 * decline), outgoing/pending requests (cancel), a blocked list (unblock),
 * and a form to send a new request by email. Reads/writes via the 6
 * `apiClient` friends methods through the `useFriendsData` hook.
 *
 * IA: this is a PUSHED screen, not a tab — reached from a "Manage friends"
 * row on the Activity tab's Friends section, alongside the Step 8
 * "Friends leaderboard" row. Same top-level-route pattern as
 * `leaderboard.tsx`, `challenge/[challengeId].tsx`. The member app stays
 * fixed at 5 tabs.
 *
 * Gating: this route carries no gate of its own. It inherits the app-wide
 * Pro-tenant gate enforced in `app/_layout.tsx`'s `AuthGate` (same as
 * `leaderboard.tsx` — see that file's header for the full rationale). This
 * screen adds no upgrade/pricing UI of its own — payment neutrality per
 * AGENTS.md §3.1.
 *
 * Layout (top-to-bottom):
 *   1. Header — screen title + Refresh button
 *   2. (Optional) list-load error banner with Retry
 *   3. "Add a friend" — email field + Send request button
 *   4. Incoming requests — Accept / Decline per row
 *   5. Friends — accepted list, Unfriend per row (Alert-confirmed)
 *   6. Pending — outgoing requests, Cancel per row
 *   7. Blocked — Unblock per row
 *   8. Empty state when every bucket is empty
 *
 * Confirmations: unfriend + block use native `Alert.alert()` (destructive
 * style) per DESIGN.md §4 "Confirmations". Accept/decline/cancel/unblock
 * are non-destructive (or trivially reversible by re-requesting) and fire
 * immediately, matching the contract's own framing of decline/withdraw as
 * "no record kept, can re-request later."
 *
 * Per mobile DESIGN.md — no chart library, plain Views, theme tokens only.
 */

import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { FriendBrief } from '@genoly/types';

import { useFriendsData, REQUEST_SENTINEL } from '../hooks/useFriendsData';
import { emailSchema } from '../lib/authSchemas';
import { useThemedStyles, useTheme, MIN_TOUCH_TARGET, type Theme } from '../theme';
import { Banner, Button, TextField, toast } from '../components/ui';

const addFriendSchema = z.object({ targetEmail: emailSchema });
type AddFriendForm = z.infer<typeof addFriendSchema>;

export default function FriendsScreen() {
  const t = useTheme();
  const styles = useThemedStyles(createStyles);
  const data = useFriendsData();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddFriendForm>({
    resolver: zodResolver(addFriendSchema),
    defaultValues: { targetEmail: '' },
  });

  const sending = data.busyFriendshipId === REQUEST_SENTINEL;

  // Surface action failures as a toast — the hook clears actionError at
  // the start of every new action, so this fires once per failure. Direct
  // return-value checks (below, per-handler) drive success toasts instead,
  // since those are never stale.
  useEffect(() => {
    if (data.actionError) {
      toast.error(data.actionError);
    }
  }, [data.actionError]);

  const onRefresh = useCallback(() => {
    data.refresh();
  }, [data]);

  const onSubmitAddFriend = useCallback(
    async (values: AddFriendForm) => {
      const ok = await data.sendRequest(values.targetEmail.trim());
      if (ok) {
        toast.success('Friend request sent.');
        reset({ targetEmail: '' });
      }
    },
    [data, reset],
  );

  const onAccept = useCallback(
    async (row: FriendBrief) => {
      const ok = await data.acceptRequest(row.friendshipId);
      if (ok) toast.success(`You're now friends with ${row.displayName ?? 'them'}.`);
    },
    [data],
  );

  const onDecline = useCallback(
    async (row: FriendBrief) => {
      const ok = await data.declineRequest(row.friendshipId);
      if (ok) toast.info(`Declined ${row.displayName ?? "their"} request.`);
    },
    [data],
  );

  const onUnfriend = useCallback(
    (row: FriendBrief) => {
      const name = row.displayName ?? 'this friend';
      Alert.alert(
        'Unfriend',
        `You'll no longer see ${name} on your leaderboard or friends list.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unfriend',
            style: 'destructive',
            onPress: async () => {
              const ok = await data.removeFriendship(row.friendshipId);
              if (ok) toast.info(`Removed ${name} as a friend.`);
            },
          },
        ],
        { cancelable: true },
      );
    },
    [data],
  );

  const onCancelRequest = useCallback(
    async (row: FriendBrief) => {
      const ok = await data.removeFriendship(row.friendshipId);
      if (ok) toast.info(`Canceled your request to ${row.displayName ?? 'them'}.`);
    },
    [data],
  );

  const onBlock = useCallback(
    (row: FriendBrief) => {
      const name = row.displayName ?? 'this person';
      Alert.alert(
        'Block',
        `${name} won't be able to send you friend requests or see your activity.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              const ok = await data.blockFriend(row.friendshipId);
              if (ok) toast.info(`Blocked ${name}.`);
            },
          },
        ],
        { cancelable: true },
      );
    },
    [data],
  );

  const onUnblock = useCallback(
    async (row: FriendBrief) => {
      const ok = await data.removeFriendship(row.friendshipId);
      if (ok) toast.info(`Unblocked ${row.displayName ?? 'them'}.`);
    },
    [data],
  );

  if (data.initialLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Friends' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={t.colors.primary} />
          <Text style={styles.loadingText}>Loading friends…</Text>
        </View>
      </>
    );
  }

  const isEmpty =
    data.accepted.length === 0 &&
    data.pendingIncoming.length === 0 &&
    data.pendingOutgoing.length === 0 &&
    data.blocked.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Friends' }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={onRefresh}
            tintColor={t.colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.screenTitle}>Friends</Text>
            <Text style={styles.subtitle}>Manage friend requests and connections</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh friends"
            style={[styles.refreshButton, data.refreshing && styles.refreshButtonDisabled]}
            onPress={onRefresh}
            disabled={data.refreshing}
          >
            {data.refreshing ? (
              <ActivityIndicator size="small" color={t.colors.primary} />
            ) : (
              <Text style={styles.refreshButtonText}>Refresh</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* List-load error banner */}
        {data.error && (
          <Banner variant="error" message={data.error} actionLabel="Retry" onAction={onRefresh} />
        )}

        {/* Add a friend */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add a friend</Text>
          <View style={styles.sectionBody}>
            <Controller
              control={control}
              name="targetEmail"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Genoly email"
                  placeholder="friend@example.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!sending}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.targetEmail?.message}
                />
              )}
            />
            <Button
              label="Send request"
              onPress={handleSubmit(onSubmitAddFriend)}
              loading={sending}
              accessibilityLabel="Send friend request"
            />
          </View>
        </View>

        {/* Incoming requests */}
        {data.pendingIncoming.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requests</Text>
            <View style={styles.sectionBody}>
              {data.pendingIncoming.map((row, idx) => (
                <View key={row.friendshipId}>
                  {idx > 0 && <View style={styles.divider} />}
                  <FriendRowView
                    row={row}
                    styles={styles}
                    busy={data.busyFriendshipId === row.friendshipId}
                    accessibilityLabel={`${row.displayName ?? 'Someone'} sent you a friend request`}
                    actions={
                      <View style={styles.actionRow}>
                        <Button
                          label="Accept"
                          onPress={() => onAccept(row)}
                          loading={data.busyFriendshipId === row.friendshipId}
                          disabled={data.busyFriendshipId !== null && data.busyFriendshipId !== row.friendshipId}
                          accessibilityLabel={`Accept ${row.displayName ?? 'their'} friend request`}
                          style={styles.actionButton}
                        />
                        <Button
                          variant="secondary"
                          label="Decline"
                          onPress={() => onDecline(row)}
                          disabled={data.busyFriendshipId !== null}
                          accessibilityLabel={`Decline ${row.displayName ?? 'their'} friend request`}
                          style={styles.actionButton}
                        />
                      </View>
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Accepted friends */}
        {data.accepted.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friends</Text>
            <View style={styles.sectionBody}>
              {data.accepted.map((row, idx) => (
                <View key={row.friendshipId}>
                  {idx > 0 && <View style={styles.divider} />}
                  <FriendRowView
                    row={row}
                    styles={styles}
                    busy={data.busyFriendshipId === row.friendshipId}
                    accessibilityLabel={`${row.displayName ?? 'Friend'}, accepted friend`}
                    actions={
                      <Button
                        variant="destructive"
                        label="Unfriend"
                        onPress={() => onUnfriend(row)}
                        loading={data.busyFriendshipId === row.friendshipId}
                        disabled={data.busyFriendshipId !== null && data.busyFriendshipId !== row.friendshipId}
                        accessibilityLabel={`Unfriend ${row.displayName ?? 'this friend'}`}
                        style={styles.actionButtonWide}
                      />
                    }
                    secondaryAction={
                      <Button
                        variant="link"
                        label="Block"
                        onPress={() => onBlock(row)}
                        disabled={data.busyFriendshipId !== null}
                        accessibilityLabel={`Block ${row.displayName ?? 'this friend'}`}
                      />
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Outgoing / pending requests */}
        {data.pendingOutgoing.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pending</Text>
            <View style={styles.sectionBody}>
              {data.pendingOutgoing.map((row, idx) => (
                <View key={row.friendshipId}>
                  {idx > 0 && <View style={styles.divider} />}
                  <FriendRowView
                    row={row}
                    styles={styles}
                    busy={data.busyFriendshipId === row.friendshipId}
                    badge="Pending"
                    accessibilityLabel={`Request to ${row.displayName ?? 'them'}, pending`}
                    actions={
                      <Button
                        variant="secondary"
                        label="Cancel"
                        onPress={() => onCancelRequest(row)}
                        loading={data.busyFriendshipId === row.friendshipId}
                        disabled={data.busyFriendshipId !== null && data.busyFriendshipId !== row.friendshipId}
                        accessibilityLabel={`Cancel your request to ${row.displayName ?? 'them'}`}
                        style={styles.actionButtonWide}
                      />
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Blocked */}
        {data.blocked.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Blocked</Text>
            <View style={styles.sectionBody}>
              {data.blocked.map((row, idx) => (
                <View key={row.friendshipId}>
                  {idx > 0 && <View style={styles.divider} />}
                  <FriendRowView
                    row={row}
                    styles={styles}
                    busy={data.busyFriendshipId === row.friendshipId}
                    badge="Blocked"
                    accessibilityLabel={`${row.displayName ?? 'This person'}, blocked`}
                    actions={
                      <Button
                        variant="secondary"
                        label="Unblock"
                        onPress={() => onUnblock(row)}
                        loading={data.busyFriendshipId === row.friendshipId}
                        disabled={data.busyFriendshipId !== null && data.busyFriendshipId !== row.friendshipId}
                        accessibilityLabel={`Unblock ${row.displayName ?? 'this person'}`}
                        style={styles.actionButtonWide}
                      />
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {isEmpty && !data.error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No friends yet</Text>
            <Text style={styles.emptyStateBody}>
              Send a request above using someone&apos;s Genoly email to start comparing steps on
              the leaderboard.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

type Styles = ReturnType<typeof createStyles>;

// ── Sub-components ───────────────────────────────────────────────────

function FriendRowView({
  row,
  styles,
  busy,
  badge,
  accessibilityLabel,
  actions,
  secondaryAction,
}: {
  row: FriendBrief;
  styles: Styles;
  busy: boolean;
  badge?: string;
  accessibilityLabel: string;
  actions: ReactNode;
  secondaryAction?: ReactNode;
}) {
  const name = row.displayName ?? 'Genoly member';
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.rowTopLine}>
        <View style={styles.nameCol}>
          <Text style={styles.displayName}>{name}</Text>
          {badge && <Text style={styles.badge}>{badge}</Text>}
        </View>
        {busy && <ActivityIndicator size="small" style={styles.rowSpinner} />}
      </View>
      <View style={styles.rowActionsLine}>
        {actions}
        {secondaryAction}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

function createStyles(t: Theme) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      backgroundColor: t.colors.bg,
    },
    loadingText: {
      marginTop: t.spacing.md,
      fontSize: 14,
      color: t.colors.textMuted,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: t.spacing.sm,
      marginBottom: t.spacing.xl,
    },
    headerTextCol: {
      flexShrink: 1,
    },
    screenTitle: {
      ...t.typography.screenTitle,
      color: t.colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: t.colors.textMuted,
      marginTop: 2,
    },
    refreshButton: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.sm,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.lg,
      backgroundColor: t.colors.bgElevated,
      minWidth: 84,
      alignItems: 'center',
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
    },
    refreshButtonDisabled: {
      opacity: 0.7,
    },
    refreshButtonText: {
      color: t.colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    section: {
      marginBottom: t.spacing.xxl,
    },
    sectionTitle: {
      ...t.typography.sectionHeader,
      color: t.colors.textMuted,
      marginBottom: t.spacing.sm,
    },
    sectionBody: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.lg,
    },
    row: {
      paddingVertical: t.spacing.md,
    },
    rowTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: t.spacing.sm,
    },
    nameCol: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: t.spacing.sm,
    },
    displayName: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    badge: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: t.colors.textMuted,
      backgroundColor: t.colors.surfaceMuted,
      paddingVertical: 2,
      paddingHorizontal: t.spacing.xs + 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
    rowSpinner: {
      marginLeft: t.spacing.sm,
    },
    rowActionsLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    actionRow: {
      flexDirection: 'row',
      flex: 1,
      gap: t.spacing.sm,
    },
    actionButton: {
      flex: 1,
    },
    actionButtonWide: {
      minWidth: 120,
    },
    divider: {
      height: 1,
      backgroundColor: t.colors.border,
      marginVertical: t.spacing.xs,
    },
    emptyState: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      padding: t.spacing.xl,
      alignItems: 'center',
    },
    emptyStateTitle: {
      ...t.typography.cardTitle,
      color: t.colors.text,
      marginBottom: t.spacing.sm,
      textAlign: 'center',
    },
    emptyStateBody: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
      textAlign: 'center',
    },
  });
}
