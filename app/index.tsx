import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform, TouchableOpacity, Dimensions, ActionSheetIOS, Linking, Image, StatusBar, Alert, ViewStyle, TextInput } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideInRight,
  SlideOutRight,
  SlideOutDown
} from 'react-native-reanimated';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AdMob kodunu geçici olarak kaldırıyoruz
// import * as Admob from 'expo-ads-admob';

interface Pharmacy {
  isim: string;
  adres: string;
  telefon: string;
  il: string;
  ilce: string;
  mahalle: string;
  latitude: number;
  longitude: number;
  isFavorite?: boolean;
}

interface City {
  id: number;
  name: string;
}

interface SelectProps {
  label: string;
  value: string;
  items: { id: number; name: string }[];
  onValueChange: (value: string, id: number) => void;
  loading?: boolean;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const Select: React.FC<SelectProps> = ({ label, value, items, onValueChange, loading }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }]
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const openActionSheet = () => {
    if (loading || items.length === 0) return;

    const options = ['İptal', ...items.map(item => item.name)];
    const cancelButtonIndex = 0;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: `${label} Seçin`,
        message: 'Lütfen bir seçim yapın',
      },
      (buttonIndex) => {
        if (buttonIndex !== cancelButtonIndex) {
          const selectedItem = items[buttonIndex - 1];
          onValueChange(selectedItem.name, selectedItem.id);
        }
      }
    );
  };

  return (
    <Animated.View 
      style={styles.selectContainer}
      entering={FadeIn.duration(500).delay(200)}
    >
      <Text style={styles.label}>{label}</Text>
      <AnimatedTouchableOpacity
        style={[
          styles.selectButton, 
          value ? styles.selectButtonSelected : null,
          animatedStyle
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={openActionSheet}
        disabled={loading}>
        <Text style={[
          styles.selectButtonText,
          value ? styles.selectButtonTextSelected : null
        ]}>
          {value || `${label} seçiniz`}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color="#E53935" />
        ) : (
          <Ionicons 
            name={value ? "location" : "location-outline"} 
            size={24} 
            color={value ? "#E53935" : "#666"} 
          />
        )}
      </AnimatedTouchableOpacity>
    </Animated.View>
  );
};

// Bildirim ayarlarını yapılandır
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Banner Reklam componenti - geçici olarak devre dışı
const BannerAd = () => {
  // Reklam kodu geçici olarak devre dışı
  return null;
};

export default function Index() {
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedCityId, setSelectedCityId] = useState<number>(0);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<{ id: number; name: string }[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [region, setRegion] = useState({
    latitude: 39.9334,
    longitude: 32.8597,
    latitudeDelta: 20,
    longitudeDelta: 20,
  });
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const mapRef = useRef<MapView>(null);
  const mapHeight = useSharedValue(Dimensions.get('window').height - 200);
  const listOpacity = useSharedValue(1);
  const detailsHeight = useSharedValue(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const [favoritePharmacies, setFavoritePharmacies] = useState<Pharmacy[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const initialLoadingContainer: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000
  };

  const loadingIconContainer: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  };

  const getUserLocationDetails = async (location: Location.LocationObject) => {
    try {
      console.log('Konum detayları alınıyor...');
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (geocode && geocode.length > 0) {
        const address = geocode[0];
        console.log('Bulunan adres:', address);
        
        const cityName = address.region || '';
        console.log('Bulunan şehir:', cityName);
        
        if (cityName) {
          const normalizedCityName = cityName.toLowerCase()
            .replace('ı', 'i')
            .replace('ğ', 'g')
            .replace('ü', 'u')
            .replace('ş', 's')
            .replace('ö', 'o')
            .replace('ç', 'c');

          // İl ve ilçe bilgilerini hemen ayarla
          setSelectedCity(cityName);
          
          const districtName = address.subregion || '';
          if (districtName) {
            setSelectedDistrict(districtName);
            
            // Doğrudan eczaneleri getir
            const endpoint = `https://bf40-95-70-207-209.ngrok-free.app/api/eczaneler/${cityName.toLowerCase()}/${districtName.toLowerCase()}`;
            console.log('Eczaneler için endpoint:', endpoint);
            
            const response = await fetch(endpoint);
            const data = await response.json();
            
            if (data.status && data.data) {
              console.log('Bulunan eczane sayısı:', data.data.length);
              setPharmacies(data.data);
              
              if (data.data.length > 0) {
                const firstPharmacy = data.data[0];
                setRegion({
                  latitude: firstPharmacy.latitude,
                  longitude: firstPharmacy.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Konum detayları alınamadı:', error);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      setInitialLoading(true);
      try {
        // Önce konum izni kontrolü
        const { status } = await Location.getForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus !== 'granted') {
            Alert.alert(
              'Konum İzni Gerekli',
              'Konumunuzu görebilmemiz için izin vermeniz gerekmektedir.',
              [{ text: 'Tamam' }]
            );
            setInitialLoading(false);
            return;
          }
        }

        // Şehirleri yükle
        await loadCities();

        // Konum bilgisini al
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        setUserLocation(location);
        setRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });

        // Konum detaylarını al ve eczaneleri getir
        await getUserLocationDetails(location);
      } catch (error) {
        console.error('Konum alınamadı:', error);
        Alert.alert(
          'Hata',
          'Konumunuz alınamadı. Lütfen konum servislerinizin açık olduğundan emin olun.',
          [{ text: 'Tamam' }]
        );
      } finally {
        setTimeout(() => {
          setInitialLoading(false);
        }, 2000);
      }
    };

    initializeApp();

    return () => {
      setSelectedCity('');
      setSelectedCityId(0);
      setSelectedDistrict('');
      setPharmacies([]);
      setUserLocation(null);
    };
  }, []);

  useEffect(() => {
    console.log('Uygulama başlatılıyor, push notification kaydı yapılacak...');
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        console.log('Push Token state\'e kaydediliyor:', token);
        setExpoPushToken(token);
        
        console.log('Token backend\'e gönderiliyor...');
        fetch('https://bf40-95-70-207-209.ngrok-free.app/api/register-device', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: token,
            platform: Platform.OS
          }),
        }).then(response => {
          console.log('Backend yanıtı:', response.status);
          return response.json();
        }).then(data => {
          console.log('Backend yanıt detayı:', data);
        }).catch(error => {
          console.error('Token kayıt hatası:', error);
        });
      } else {
        console.log('Push token alınamadı');
      }
    });

    // Bildirim izinlerini kontrol et
    Notifications.getPermissionsAsync().then(permission => {
      console.log('Bildirim izinleri:', permission);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Bildirim alındı:', notification);
      setNotification(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Bildirime tıklandı:', response);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const loadCities = async () => {
    try {
      setCitiesLoading(true);
      const response = await fetch('https://bf40-95-70-207-209.ngrok-free.app/api/cities');
      const responseText = await response.text();
      console.log('Şehirler API yanıtı:', responseText);
      
      if (!response.ok) {
        console.error('Şehirler API Hatası:', {
          status: response.status,
          statusText: response.statusText,
          response: responseText
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = JSON.parse(responseText);
      if (data && data.status && data.data) {
        setCities(data.data);
      } else {
        console.error('Geçersiz şehir verisi:', data);
        setCities([]);
      }
    } catch (error) {
      console.error('Şehirler yüklenirken hata:', error);
      setCities([]);
    } finally {
      setCitiesLoading(false);
    }
  };

  const fetchDistricts = async (cityId: number) => {
    try {
      setLoading(true);
      console.log('İlçeler için şehir ID:', cityId);
      const response = await fetch(`https://bf40-95-70-207-209.ngrok-free.app/api/cities/${cityId}/districts`);
      const responseText = await response.text();
      console.log('İlçeler API yanıtı:', responseText);
      
      if (!response.ok) {
        console.error('İlçeler API Hatası:', {
          status: response.status,
          statusText: response.statusText,
          response: responseText
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = JSON.parse(responseText);
      if (data && data.status && data.data) {
        setDistricts(data.data);
      } else {
        console.error('Geçersiz ilçe verisi:', data);
        setDistricts([]);
      }
    } catch (error) {
      console.error('İlçeler yüklenirken hata:', error);
      setDistricts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPharmacies = async (city: string, district?: string) => {
    try {
      setLoading(true);
      // Türkçe karakterleri düzelt
      const normalizedCity = city.toLowerCase()
        .replace('ı', 'i')
        .replace('ğ', 'g')
        .replace('ü', 'u')
        .replace('ş', 's')
        .replace('ö', 'o')
        .replace('ç', 'c');
      
      const normalizedDistrict = district ? district.toLowerCase()
        .replace('ı', 'i')
        .replace('ğ', 'g')
        .replace('ü', 'u')
        .replace('ş', 's')
        .replace('ö', 'o')
        .replace('ç', 'c') : undefined;

      const baseUrl = 'https://bf40-95-70-207-209.ngrok-free.app/api/eczaneler';
      const endpoint = normalizedDistrict 
        ? `${baseUrl}/${normalizedCity}/${normalizedDistrict}` 
        : `${baseUrl}/${normalizedCity}`;
      
      console.log('Eczaneler için endpoint:', endpoint);
      
      const response = await fetch(endpoint);
      const responseText = await response.text();
      console.log('Eczaneler API yanıtı:', responseText);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = JSON.parse(responseText);
      if (data && data.status && data.data) {
        // Eczaneleri favori durumlarıyla birlikte ayarla
        const pharmaciesWithFavorites = data.data.map((pharmacy: Pharmacy) => ({
          ...pharmacy,
          isFavorite: favoritePharmacies.some(fav => fav.isim === pharmacy.isim)
        }));
        setPharmacies(pharmaciesWithFavorites);
        if (data.data.length > 0) {
          const firstPharmacy = data.data[0];
          setRegion({
            latitude: firstPharmacy.latitude,
            longitude: firstPharmacy.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          });
        }
      } else {
        console.error('Geçersiz eczane verisi:', data);
        setPharmacies([]);
      }
    } catch (error) {
      console.error('Eczaneler yüklenirken hata:', error);
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCallPharmacy = (phone: string) => {
    const phoneNumber = phone.replace(/\s/g, '');
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleGetDirections = (pharmacy: Pharmacy) => {
    if (Platform.OS === 'ios') {
      const options = ['İptal', 'Apple Haritalar', 'Google Haritalar', 'Yandex Navi'];
      const cancelButtonIndex = 0;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
          title: 'Yol Tarifi',
          message: 'Harita uygulaması seçin',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            // Apple Haritalar
            Linking.openURL(`maps://app?daddr=${pharmacy.latitude},${pharmacy.longitude}`);
          } else if (buttonIndex === 2) {
            // Google Haritalar
            Linking.openURL(`comgooglemaps://?daddr=${pharmacy.latitude},${pharmacy.longitude}`);
          } else if (buttonIndex === 3) {
            // Yandex Navi
            Linking.openURL(`yandexnavi://build_route_on_map?lat_to=${pharmacy.latitude}&lon_to=${pharmacy.longitude}`);
          }
        }
      );
    } else {
      // Android için harita uygulamalarını kontrol et
      const googleMapsUrl = `google.navigation:q=${pharmacy.latitude},${pharmacy.longitude}`;
      const yandexMapsUrl = `yandexmaps://maps.yandex.com/?pt=${pharmacy.longitude},${pharmacy.latitude}&z=15`;
      const yandexNaviUrl = `yandexnavi://build_route_on_map?lat_to=${pharmacy.latitude}&lon_to=${pharmacy.longitude}`;
      
      // Önce Google Maps'i kontrol et
      Linking.canOpenURL(googleMapsUrl).then((supported) => {
        if (supported) {
          Linking.openURL(googleMapsUrl);
        } else {
          // Google Maps yüklü değilse Yandex Maps'i dene
          Linking.canOpenURL(yandexMapsUrl).then((yandexSupported) => {
            if (yandexSupported) {
              // Yandex Maps yüklüyse, Yandex Navi'yi kontrol et
              Linking.canOpenURL(yandexNaviUrl).then((yandexNaviSupported) => {
                if (yandexNaviSupported) {
                  Linking.openURL(yandexNaviUrl);
                } else {
                  Linking.openURL(yandexMapsUrl);
                }
              });
            } else {
              // Hiçbir harita uygulaması yüklü değilse web tarayıcıda aç
              Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}`);
            }
          });
        }
      });
    }
  };

  const handleMarkerPress = (pharmacy: Pharmacy) => {
    setSelectedPharmacy(pharmacy);
    detailsHeight.value = withSpring(275);
    
    mapRef.current?.animateToRegion({
      latitude: pharmacy.latitude,
      longitude: pharmacy.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }, 500);
  };

  const closeDetails = () => {
    setSelectedPharmacy(null);
    detailsHeight.value = withSpring(0);
  };

  const detailsAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: detailsHeight.value,
      transform: [
        {
          translateY: withSpring(detailsHeight.value === 0 ? 275 : 0, {
            damping: 15,
            stiffness: 100
          })
        }
      ]
    };
  });

  const detailsOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: withSpring(detailsHeight.value === 0 ? 0 : 1, {
        damping: 15,
        stiffness: 100
      })
    };
  });

  const mapAnimatedStyle = useAnimatedStyle(() => {
    return {
      height: withSpring(mapHeight.value, {
        damping: 15,
        stiffness: 100
      })
    };
  });

  const listAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: withSpring(listOpacity.value, {
        damping: 15,
        stiffness: 100
      })
    };
  });

  const toggleView = () => {
    setShowMap(!showMap);
    if (!showMap) {
      mapHeight.value = withSpring(Dimensions.get('window').height - 150, {
        damping: 15,
        stiffness: 100
      });
      listOpacity.value = withSpring(0, {
        damping: 15,
        stiffness: 100
      });
    } else {
      listOpacity.value = withSpring(1, {
        damping: 15,
        stiffness: 100
      });
    }
  };

  // Favori eczaneleri yükle
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const favorites = await AsyncStorage.getItem('favoritePharmacies');
        if (favorites) {
          setFavoritePharmacies(JSON.parse(favorites));
        }
      } catch (error) {
        console.error('Favoriler yüklenirken hata:', error);
      }
    };
    loadFavorites();
  }, []);

  // Favori eczane ekle/çıkar
  const toggleFavorite = async (pharmacy: Pharmacy) => {
    try {
      // Eczane zaten favorilerde mi kontrol et
      const isAlreadyFavorite = favoritePharmacies.some(fav => fav.isim === pharmacy.isim);
      
      let updatedFavorites;
      if (isAlreadyFavorite) {
        // Eczaneyi favorilerden çıkar
        updatedFavorites = favoritePharmacies.filter(p => p.isim !== pharmacy.isim);
      } else {
        // Eczaneyi favorilere ekle
        updatedFavorites = [...favoritePharmacies, { ...pharmacy, isFavorite: true }];
      }
      
      // Favorileri güncelle
      setFavoritePharmacies(updatedFavorites);
      
      // Ana sayfadaki eczane listesini güncelle
      setPharmacies(prevPharmacies => 
        prevPharmacies.map(p => 
          p.isim === pharmacy.isim 
            ? { ...p, isFavorite: !isAlreadyFavorite }
            : p
        )
      );
      
      // AsyncStorage'a kaydet
      await AsyncStorage.setItem('favoritePharmacies', JSON.stringify(updatedFavorites));
    } catch (error) {
      console.error('Favori güncellenirken hata:', error);
    }
  };

  // Favorileri filtrele
  const filteredFavorites = favoritePharmacies.filter(pharmacy =>
    pharmacy.isim.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pharmacy.adres.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#E53935" />
      <Animated.View 
        style={styles.header}
        entering={SlideInDown.duration(800)}
      >
        <View style={styles.headerContent}>
          <Image 
            source={require('../assets/logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Nöbetçi Eczaneler</Text>
            <Text style={styles.headerSubtitle}>Size en yakın nöbetçi eczaneyi bulun</Text>
          </View>
          <AnimatedTouchableOpacity 
            onPress={toggleView} 
            style={styles.viewToggle}
            entering={FadeIn.duration(500)}
          >
              <Ionicons 
                name={showMap ? "list" : "map"} 
                size={24} 
                color="#fff" 
              />
          </AnimatedTouchableOpacity>
        </View>
      </Animated.View>
      
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Ionicons 
            name="medical" 
            size={24} 
            color={activeTab === 'all' ? '#E53935' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            Tüm Eczaneler
          </Text>
            </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'favorites' && styles.activeTab]}
          onPress={() => setActiveTab('favorites')}
        >
          <Ionicons 
            name="heart" 
            size={24} 
            color={activeTab === 'favorites' ? '#E53935' : '#666'} 
          />
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.activeTabText]}>
            Favoriler
          </Text>
        </TouchableOpacity>
      </View>
      
      {initialLoading ? (
        <Animated.View 
          style={initialLoadingContainer}
          entering={FadeIn.duration(500)}
        >
          <Text style={styles.initialLoadingText}>Nöbetçi Eczaneler</Text>
          <Text style={styles.initialLoadingSubtext}>Size en yakın nöbetçi eczaneler aranıyor...</Text>
          <ActivityIndicator size="large" color="#E53935" style={{ marginTop: 20 }} />
        </Animated.View>
      ) : (
        <>
      <View style={styles.searchContainer}>
            {activeTab === 'all' ? (
              <Animated.View 
                style={[styles.searchBox]}
                entering={SlideInDown.duration(1000).delay(200)}
              >
          <Select
            label="İl"
            value={selectedCity}
            items={cities}
                  onValueChange={async (name, id) => {
              setSelectedCity(name);
              setSelectedCityId(id);
              setSelectedDistrict('');
                    setPharmacies([]);
                    
                    // Sadece il için eczaneleri getir
                    const baseUrl = 'https://bf40-95-70-207-209.ngrok-free.app/api/eczaneler';
                    const endpoint = `${baseUrl}/${name.toLowerCase()}`;
                    console.log('İl için eczane endpoint:', endpoint);
                    
                    try {
                      setLoading(true);
                      const response = await fetch(endpoint);
                      const data = await response.json();
                      
                      if (data.status && data.data) {
                        console.log('Bulunan eczane sayısı:', data.data.length);
                        setPharmacies(data.data);
                        
                        if (data.data.length > 0) {
                          const firstPharmacy = data.data[0];
                          setRegion({
                            latitude: firstPharmacy.latitude,
                            longitude: firstPharmacy.longitude,
                            latitudeDelta: 0.02,
                            longitudeDelta: 0.02,
                          });
                        }
                      }
                    } catch (error) {
                      console.error('Eczaneler yüklenirken hata:', error);
                      setPharmacies([]);
                    } finally {
                      setLoading(false);
                    }
                    
                    // İlçeleri yükle - ID ile
                    await fetchDistricts(id);
            }}
            loading={citiesLoading}
          />

          {selectedCity && (
            <Select
              label="İlçe"
              value={selectedDistrict}
              items={districts}
                    onValueChange={async (name) => {
                setSelectedDistrict(name);
                      if (selectedCity && name) {
                        const baseUrl = 'https://bf40-95-70-207-209.ngrok-free.app/api/eczaneler';
                        const endpoint = `${baseUrl}/${selectedCity.toLowerCase()}/${name.toLowerCase()}`;
                        console.log('İl ve ilçe için eczane endpoint:', endpoint);
                        
                        try {
                          setLoading(true);
                          const response = await fetch(endpoint);
                          const data = await response.json();
                          
                          if (data.status && data.data) {
                            console.log('Bulunan eczane sayısı:', data.data.length);
                            setPharmacies(data.data);
                            
                            if (data.data.length > 0) {
                              const firstPharmacy = data.data[0];
                              setRegion({
                                latitude: firstPharmacy.latitude,
                                longitude: firstPharmacy.longitude,
                                latitudeDelta: 0.02,
                                longitudeDelta: 0.02,
                              });
                            }
                          }
                        } catch (error) {
                          console.error('Eczaneler yüklenirken hata:', error);
                          setPharmacies([]);
                        } finally {
                          setLoading(false);
                        }
                      }
              }}
              loading={loading}
            />
                )}
              </Animated.View>
            ) : (
              <Animated.View 
                style={[styles.searchBox]}
                entering={SlideInDown.duration(1000).delay(200)}
              >
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Eczane ara..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholderTextColor="#666"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity 
                      onPress={() => setSearchQuery('')}
                      style={styles.clearButton}
                    >
                      <Ionicons name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
          )}
        </View>
              </Animated.View>
            )}
      </View>

      {loading ? (
            <Animated.View 
              style={styles.loadingContainer}
              entering={FadeIn}
              exiting={FadeOut}
            >
          <ActivityIndicator size="large" color="#E53935" />
          <Text style={styles.loadingText}>Eczaneler aranıyor...</Text>
            </Animated.View>
      ) : pharmacies.length > 0 ? (
        showMap ? (
              <Animated.View 
                style={styles.fullMapContainer}
                entering={SlideInRight}
                exiting={SlideOutRight}
              >
            <MapView
                  ref={mapRef}
                  style={styles.fullMap}
              region={region}
                  onRegionChangeComplete={setRegion}
                  provider={PROVIDER_DEFAULT}
              showsUserLocation={true}
                  showsMyLocationButton={true}
            >
              {pharmacies.map((pharmacy, index) => (
                <Marker
                  key={index}
                  coordinate={{
                    latitude: pharmacy.latitude,
                    longitude: pharmacy.longitude
                  }}
                  title={pharmacy.isim}
                  description={pharmacy.adres}
                      onPress={() => handleMarkerPress(pharmacy)}
                    >
                      <Animated.View 
                        style={[
                          styles.markerContainer,
                          selectedPharmacy?.isim === pharmacy.isim && styles.selectedMarker
                        ]}
                        entering={FadeIn.duration(500).delay(index * 100)}
                      >
                        <Ionicons 
                          name="medical" 
                          size={24} 
                          color={selectedPharmacy?.isim === pharmacy.isim ? '#fff' : '#E53935'} 
                        />
                      </Animated.View>
                </Marker>
              ))}
            </MapView>

                <Animated.View 
                  style={[styles.pharmacyDetailsCard, detailsAnimatedStyle]}
                >
                  <Animated.View style={[styles.detailsContentWrapper, detailsOpacityStyle]}>
                    {selectedPharmacy && (
                      <View style={styles.detailsContent}>
                        <TouchableOpacity 
                          style={styles.closeButton}
                          onPress={closeDetails}
                        >
                          <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                        
                        <View style={styles.pharmacyHeader}>
                          <View style={styles.pharmacyTitleContainer}>
                            <View style={styles.pharmacyIconContainer}>
                              <Ionicons name="medical" size={24} color="#fff" />
          </View>
                            <Text style={styles.pharmacyName}>{selectedPharmacy.isim}</Text>
                          </View>
                        </View>

                        <View style={styles.pharmacyDetailsInfo}>
                          <View style={styles.detailRow}>
                            <View style={styles.detailIconContainer}>
                              <Ionicons name="location" size={18} color="#E53935" />
                            </View>
                            <Text style={styles.pharmacyInfo}>{selectedPharmacy.adres}</Text>
                          </View>

                          <View style={styles.actionButtons}>
                            <TouchableOpacity 
                              style={[styles.actionButton, styles.actionButtonGreen]}
                              onPress={() => handleCallPharmacy(selectedPharmacy.telefon)}
                            >
                              <Ionicons name="call" size={20} color="#fff" />
                              <Text style={styles.actionButtonText}>Ara</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                              style={[styles.actionButton, styles.actionButtonRed]}
                              onPress={() => handleGetDirections(selectedPharmacy)}
                            >
                              <Ionicons name="navigate" size={20} color="#fff" />
                              <Text style={styles.actionButtonText}>Yol Tarifi</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            ) : (
              <Animated.View 
                style={[{ flex: 1 }, listAnimatedStyle]}
                entering={FadeIn}
                exiting={FadeOut}
              >
          <ScrollView style={styles.content}>
            <View style={styles.pharmacyList}>
                    {(activeTab === 'all' ? pharmacies : filteredFavorites).map((pharmacy, index) => (
                      <Animated.View 
                        key={index} 
                        style={styles.pharmacyCard}
                        entering={SlideInDown.duration(500).delay(index * 100)}
                      >
                  <View style={styles.pharmacyHeader}>
                    <View style={styles.pharmacyTitleContainer}>
                      <View style={styles.pharmacyIconContainer}>
                        <Ionicons name="medical" size={24} color="#fff" />
                      </View>
                      <Text style={styles.pharmacyName}>{pharmacy.isim}</Text>
                    </View>
                          <View style={styles.headerButtons}>
                            <TouchableOpacity 
                              style={styles.favoriteButton}
                              onPress={() => toggleFavorite(pharmacy)}
                            >
                              <Ionicons 
                                name={pharmacy.isFavorite ? "heart" : "heart-outline"} 
                                size={24} 
                                color={pharmacy.isFavorite ? "#E53935" : "#666"} 
                              />
                            </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.callButton}
                      onPress={() => handleCallPharmacy(pharmacy.telefon)}
                    >
                      <Ionicons name="call" size={20} color="#fff" />
                    </TouchableOpacity>
                          </View>
                  </View>
                  <View style={styles.pharmacyDetails}>
                    <View style={styles.detailRow}>
                      <View style={styles.detailIconContainer}>
                        <Ionicons name="location" size={18} color="#E53935" />
                      </View>
                      <Text style={styles.pharmacyInfo}>{pharmacy.adres}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <View style={styles.detailIconContainer}>
                        <Ionicons name="call-outline" size={18} color="#E53935" />
                      </View>
                      <Text style={styles.pharmacyInfo}>{pharmacy.telefon}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.directionsButton}
                      onPress={() => handleGetDirections(pharmacy)}
                    >
                      <Ionicons name="navigate" size={18} color="#fff" />
                      <Text style={styles.directionsButtonText}>Yol Tarifi Al</Text>
                    </TouchableOpacity>
                  </View>
                      </Animated.View>
              ))}
            </View>
          </ScrollView>
              </Animated.View>
        )
      ) : selectedCity && selectedDistrict ? (
            <Animated.View 
              style={styles.emptyContainer}
              entering={FadeIn.duration(500)}
            >
          <Ionicons name="medical-outline" size={64} color="#E53935" />
          <Text style={styles.emptyText}>Nöbetçi eczane bulunamadı</Text>
          <Text style={styles.emptySubtext}>Seçtiğiniz bölgede nöbetçi eczane bulunmamaktadır</Text>
            </Animated.View>
      ) : null}

      {/* Banner Reklam - geçici olarak devre dışı */}
      {/* <BannerAd /> */}
        </>
      )}
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#E53935',
    paddingTop: Platform.OS === 'ios' ? 60 : 35,
    paddingBottom: 25,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 10,
  },
  logo: {
    width: 55,
    height: 55,
    marginRight: 12,
    borderRadius: 12,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: 5,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  searchContainer: {
    marginTop: -5,
    paddingHorizontal: 15,
    marginBottom: 10,
    zIndex: 1,
  },
  searchBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 15,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 0.92 }],
  },
  content: {
    flex: 1,
  },
  selectContainer: {
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    color: '#E53935',
    paddingLeft: 4,
  },
  selectButton: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectButtonSelected: {
    borderColor: '#E53935',
    backgroundColor: '#fff',
  },
  selectButtonText: {
    color: '#495057',
    fontSize: 14,
  },
  selectButtonTextSelected: {
    color: '#E53935',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#E53935',
    fontWeight: '500',
  },
  pharmacyList: {
    padding: 15,
  },
  pharmacyCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginBottom: 15,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  pharmacyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pharmacyTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pharmacyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pharmacyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    flex: 1,
  },
  callButton: {
    backgroundColor: '#4CAF50',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pharmacyDetails: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pharmacyInfo: {
    fontSize: 15,
    color: '#495057',
    flex: 1,
  },
  directionsButton: {
    backgroundColor: '#E53935',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 15,
    marginTop: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  directionsButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#E53935',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#6c757d',
    textAlign: 'center',
  },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 20,
    margin: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E53935',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectedMarker: {
    backgroundColor: '#E53935',
    borderColor: '#fff',
    transform: [{ scale: 1.2 }],
  },
  fullMapContainer: {
    flex: 1,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 140 : 120,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
  },
  fullMap: {
    flex: 1,
  },
  pharmacyDetailsCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  detailsContent: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    padding: 5,
  },
  pharmacyDetailsInfo: {
    marginTop: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonGreen: {
    backgroundColor: '#4CAF50',
  },
  actionButtonRed: {
    backgroundColor: '#E53935',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  initialLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000
  },
  initialLoadingText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#E53935',
    marginBottom: 10,
    textAlign: 'center',
  },
  initialLoadingSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  detailsContentWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: '#E53935',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: -5,
    marginBottom: 10,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#ffebee',
  },
  tabText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#E53935',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 45,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#212529',
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  bannerContainer: {
    width: '100%',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});

// Bildirim kaydı için yardımcı fonksiyon
async function registerForPushNotificationsAsync() {
  let token;

  console.log('Push notification kaydı başlıyor...');
  console.log('Cihaz bilgisi:', {
    isDevice: Device.isDevice,
    platform: Platform.OS,
    modelName: Device.modelName,
    osVersion: Device.osVersion,
    deviceName: Device.deviceName
  });

  if (Platform.OS === 'android') {
    console.log('Android için bildirim kanalı oluşturuluyor...');
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    console.log('Cihaz izinleri kontrol ediliyor...');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('Mevcut izin durumu:', existingStatus);
    
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      console.log('İzin isteniyor...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('Yeni izin durumu:', finalStatus);
    }
    
    if (finalStatus !== 'granted') {
      console.log('İzin reddedildi');
      Alert.alert('Bildirim İzni Gerekli', 'Nöbetçi eczane bildirimlerini alabilmek için bildirim iznine ihtiyacımız var.');
      return null;
    }
    
    console.log('Expo Push Token alınıyor...');
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      console.log('Token Data:', tokenData);
      token = tokenData.data;
      console.log('Push Token alındı:', token);
      console.log('Expo Project ID:', Constants.expoConfig?.extra?.eas?.projectId);
    } catch (error) {
      console.error('Push Token alınırken hata:', error);
    }
  } else {
    console.log('Fiziksel cihaz değil, push notification desteklenmiyor');
    Alert.alert('Fiziksel Cihaz Gerekli', 'Push bildirimleri sadece fiziksel cihazlarda çalışır.');
    return null;
  }

  return token;
} 