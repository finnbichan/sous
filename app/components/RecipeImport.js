import { Modal, Pressable, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, KeyboardAvoidingView } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import AppHeaderText from './AppHeaderText';
import AppButton from './AppButton';
import { supabase } from '../../supabase';
import { parseRecipeFromJsonLd } from '../../supabase/functions/_shared/recipeParser';

// Server errors worth retrying in the in-app browser: bot protection blocks the
// server fetch (or serves it a challenge page with no recipe), but not a real
// browser on the phone.
const BROWSER_RETRY_CODES = ['blocked', 'not_found', 'unreachable'];

// Injected into the page: report every JSON-LD block, and keep checking, since
// bot checks and single-page sites load the recipe after the first page load.
const FIND_JSON_LD = `
(function () {
  if (window.__sousImport) return;
  window.__sousImport = true;
  function report() {
    var blocks = Array.prototype.map.call(
      document.querySelectorAll('script[type="application/ld+json"]'),
      function (s) { return s.textContent || ''; }
    );
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'sous-jsonld', blocks: blocks }));
  }
  report();
  setInterval(report, 1500);
})();
true;
`;

const useImportStyles = () => {
    const { colours } = useTheme();
    return StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
        },
        sheet: {
            backgroundColor: colours.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 16,
            paddingBottom: 32
        },
        input: {
            backgroundColor: colours.card,
            color: colours.text,
            borderRadius: 16,
            paddingHorizontal: 14,
            minHeight: 46,
            fontSize: 16,
            marginVertical: 12
        },
        hint: {
            color: colours.secondaryText,
            fontSize: 14,
            marginLeft: 8
        },
        error: {
            color: '#b22222',
            marginHorizontal: 8,
            marginBottom: 8
        },
        browser: {
            flex: 1,
            backgroundColor: colours.background
        },
        browserHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingTop: 40,
            paddingBottom: 10,
            gap: 12
        },
        browserStatus: {
            flex: 1,
            color: colours.text,
            fontSize: 14
        },
        cancel: {
            color: colours.text,
            fontSize: 16,
            fontWeight: '600',
            padding: 6
        }
    });
};

// Full-screen in-app browser: shows the page (so bot checks and cookie banners
// work as in a normal browser) and imports as soon as recipe data appears.
const BrowserImport = ({ url, onFound, onCancel }) => {
    const styles = useImportStyles();
    const [status, setStatus] = useState('Opening the page…');
    const foundRef = useRef(false);

    // If nothing shows up after a while, the link probably isn't a recipe page.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!foundRef.current) {
                setStatus("No recipe found on this page yet. If it isn't the recipe itself, open the recipe.");
            }
        }, 12000);
        return () => clearTimeout(timer);
    }, []);

    const onMessage = (event) => {
        if (foundRef.current) return;
        let message;
        try {
            message = JSON.parse(event.nativeEvent.data);
        } catch {
            return;
        }
        if (message?.type !== 'sous-jsonld' || !Array.isArray(message.blocks)) return;
        const recipe = parseRecipeFromJsonLd(message.blocks);
        if (recipe?.name) {
            foundRef.current = true;
            setStatus(`Found "${recipe.name}"`);
            onFound(recipe);
        }
    };

    return (
        <Modal visible animationType="slide" onRequestClose={onCancel}>
            <SafeAreaView style={styles.browser}>
                <View style={styles.browserHeader}>
                    <TouchableOpacity onPress={onCancel} accessibilityRole="button">
                        <Text style={styles.cancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.browserStatus} numberOfLines={2}>{status}</Text>
                    {foundRef.current ? null : <ActivityIndicator />}
                </View>
                <WebView
                    source={{ uri: url }}
                    injectedJavaScript={FIND_JSON_LD}
                    onMessage={onMessage}
                    onLoadEnd={() => {
                        if (!foundRef.current) setStatus('Looking for the recipe on this page…');
                    }}
                    onError={() => setStatus("Couldn't load this page. Check the link and try again.")}
                    javaScriptEnabled
                    domStorageEnabled
                    setSupportMultipleWindows={false}
                    allowFileAccess={false}
                />
            </SafeAreaView>
        </Modal>
    );
};

// "Import from a link": tries the server first; if the site blocks it, opens the
// page in the in-app browser. Calls onImported(recipe) with the parsed recipe.
export const ImportRecipeSheet = ({ visible, onClose, onImported }) => {
    const styles = useImportStyles();
    const { colours } = useTheme();
    const [url, setUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [browserUrl, setBrowserUrl] = useState(null);

    const reset = () => {
        setUrl('');
        setError('');
        setImporting(false);
        setBrowserUrl(null);
    };

    const close = () => {
        reset();
        onClose();
    };

    const finish = (recipe) => {
        reset();
        onImported(recipe);
    };

    const startImport = async () => {
        let link = url.trim();
        if (!link || importing) return;
        if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
        setImporting(true);
        setError('');

        const { data, error: fnError } = await supabase.functions.invoke('import-recipe', { body: { url: link } });
        if (!fnError && data?.name) {
            finish(data);
            return;
        }

        let body = {};
        try {
            body = await fnError?.context?.json();
        } catch {}
        setImporting(false);
        if (BROWSER_RETRY_CODES.includes(body?.code)) {
            setBrowserUrl(link);
        } else {
            setError(body?.error || 'Could not import that recipe. Please try again.');
        }
    };

    if (!visible) return null;

    if (browserUrl) {
        return (
            <BrowserImport
                url={browserUrl}
                onFound={finish}
                onCancel={() => setBrowserUrl(null)}
            />
        );
    }

    return (
        <Modal visible transparent animationType="slide" onRequestClose={close}>
            {/* keep the sheet (and its Import button) above the keyboard */}
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <Pressable style={styles.overlay} onPress={close}>
                <Pressable style={styles.sheet} accessible={false}>
                    <AppHeaderText>Import a recipe</AppHeaderText>
                    <Text style={styles.hint}>Paste a link to a recipe page.</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="https://…"
                        placeholderTextColor={colours.secondaryText}
                        value={url}
                        onChangeText={setUrl}
                        keyboardType="url"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                        returnKeyType="go"
                        onSubmitEditing={startImport}
                    />
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    {importing ? <ActivityIndicator /> : <AppButton label="Import" onPress={startImport} />}
                </Pressable>
            </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
};
