/**
 * Add photo (wave D) — camera roll OR live camera capture via
 * expo-image-picker, uploaded straight to R2 with a presigned PUT
 * (r2:getUploadUrl action), then recorded (media:createMediaMetadata)
 * and tagged to this person (media:linkMedia). Mirrors the web upload
 * flow; "Set as profile photo" uses useType 'avatar' + isPrimary.
 */

import { StyleSheet, Switch, Text, View } from 'react-native';
import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useConvex, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import {
  getPerson,
  getUploadUrl,
  createMediaMetadata,
  linkMedia,
} from '../../../lib/genolyApi';
import { useThemedStyles, type Theme } from '../../../theme';
import { Screen, Button, TextField, toast } from '../../../components/ui';

interface PickedImage {
  uri: string;
  fileName: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

export default function AddPhotoScreen() {
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const convex = useConvex();
  const detail = useQuery(getPerson, personId ? { personId } : ('skip' as const));

  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [asAvatar, setAsAvatar] = useState(false);
  const [uploading, setUploading] = useState(false);

  const toPicked = (asset: ImagePicker.ImagePickerAsset): PickedImage => ({
    uri: asset.uri,
    fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
  });

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setPicked(toPicked(result.assets[0]));
  };

  const captureWithCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast.error('Camera access is needed to take a photo. You can enable it in Settings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]) setPicked(toPicked(result.assets[0]));
  };

  const onUpload = async () => {
    const treeId = detail?.person?.treeId;
    if (!picked || !personId || !treeId) return;
    setUploading(true);
    try {
      // 1. Presigned PUT slot.
      const { uploadUrl, objectKey } = await convex.action(getUploadUrl, {
        fileName: picked.fileName,
        contentType: picked.mimeType,
        treeId,
      });

      // 2. Raw bytes straight to R2 (never through Convex — bandwidth).
      const blob = await (await fetch(picked.uri)).blob();
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': picked.mimeType },
        body: blob,
      });
      if (!putResponse.ok) {
        throw new Error('Upload failed — please try again.');
      }

      // 3. Record + tag.
      const mediaId = await convex.mutation(createMediaMetadata, {
        treeId,
        objectKey,
        originalFileName: picked.fileName,
        mimeType: picked.mimeType,
        fileSizeBytes: picked.fileSize ?? blob.size,
        caption: caption.trim() || undefined,
        width: picked.width,
        height: picked.height,
        visibility: 'members',
        isPrimary: asAvatar,
      });
      await convex.mutation(linkMedia, {
        treeId,
        mediaId,
        targetType: 'person',
        targetId: personId,
        useType: asAvatar ? 'avatar' : 'photo',
      });

      toast.success(asAvatar ? 'Profile photo updated.' : 'Photo added.');
      router.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not upload right now.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Screen title="Add photo" subtitle={detail?.person?.preferredName}>
      <Stack.Screen options={{ title: 'Add photo' }} />

      {picked ? (
        <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Text accessibilityElementsHidden style={styles.placeholderGlyph}>
            📷
          </Text>
          <Text style={styles.placeholderText}>Pick a photo or take one now</Text>
        </View>
      )}

      <View style={styles.pickRow}>
        <Button
          variant="secondary"
          label="Camera roll"
          onPress={pickFromLibrary}
          disabled={uploading}
          style={styles.pickButton}
        />
        <Button
          variant="secondary"
          label="Take photo"
          onPress={captureWithCamera}
          disabled={uploading}
          style={styles.pickButton}
        />
      </View>

      <TextField
        label="Caption (optional)"
        placeholder="Summer reunion, 2024…"
        value={caption}
        onChangeText={setCaption}
        editable={!uploading}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Set as profile photo</Text>
        <Switch value={asAvatar} onValueChange={setAsAvatar} disabled={uploading} accessibilityLabel="Set as profile photo" />
      </View>

      <Button
        label="Upload"
        onPress={onUpload}
        loading={uploading}
        disabled={!picked}
        style={styles.upload}
      />
    </Screen>
  );
}

function createStyles(t: Theme) {
  return StyleSheet.create({
    preview: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: t.radius.md,
      marginBottom: t.spacing.lg,
    },
    placeholder: {
      width: '100%',
      aspectRatio: 1.6,
      borderRadius: t.radius.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.lg,
    },
    placeholderGlyph: {
      fontSize: 40,
      marginBottom: t.spacing.sm,
    },
    placeholderText: {
      ...t.typography.cardDescription,
      color: t.colors.textMuted,
    },
    pickRow: {
      flexDirection: 'row',
      marginBottom: t.spacing.lg,
    },
    pickButton: {
      flex: 1,
      marginRight: t.spacing.sm,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: t.spacing.md,
    },
    switchLabel: {
      ...t.typography.rowLabel,
      color: t.colors.text,
    },
    upload: {
      marginTop: t.spacing.sm,
    },
  });
}
