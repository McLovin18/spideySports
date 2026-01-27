'use client';

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import React, { useState, useEffect } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../utils/firebase";
import { Container, Row, Col, Card, Button, Form, Alert, ListGroup, Badge, Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import LoginRequired from '../components/LoginRequired';
import Image from 'next/image';
import Link from 'next/link';
import { getUserPurchases, getUserFavourites, removeFavourite, Purchase } from '../services/purchaseService';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfile } from 'firebase/auth';
import Footer from "../components/Footer";



interface Favourite {
  id: string | number;
  name: string;
  price: number;
  image: string;
  description?: string;
}

const ProfilePage = () => {
  const storage = getStorage();
  const { user, logout, updateUserProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [avatar, setAvatar] = useState('/new_user.png');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [loadingFavourites, setLoadingFavourites] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const router = useRouter();

  // Actualizar el estado cuando el usuario cambie
  useEffect(() => {
    if (user) {
      setName(user.displayName || '');
      setEmail(user.email || '');
      setAvatar(user.photoURL || '/new_user.png');
    }
  }, [user]);

  // Función para cargar historial de compras desde Firestore
  const loadPurchases = async () => {
    if (!user?.uid) return;
    
    setLoading(true);
    
    try {
      // Cargar compras desde Firestore
      const userPurchases = await getUserPurchases(user.uid);
      
      // Ordenar por fecha (más reciente primero)
      const sortedPurchases = userPurchases.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });
      
      setPurchases(sortedPurchases);
    } catch (error) {
      console.error('Error al cargar compras:', error);
      console.error('No se pudieron cargar tus compras. Intenta de nuevo más tarde.');
    } finally {
      setLoading(false);
    }
  };

  // Función para formatear fecha de manera legible
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return `Hoy a las ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 2) {
      return `Ayer a las ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays <= 7) {
      return `Hace ${diffDays - 1} días`;
    } else {
      return date.toLocaleDateString('es-ES', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  // Detectar parámetro de consulta 'tab' en la URL y cargar datos iniciales
  useEffect(() => {
    // Detectar parámetro de consulta 'tab' en la URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['personal', 'orders', 'notifications'].includes(tabParam)) {
        setActiveTab(tabParam);
        
        // Si se selecciona la pestaña de compras mediante URL, cargar los datos
        if (tabParam === 'orders') {
          loadPurchases();
        }
      }
    }
  }, [user?.uid]);

  // Efecto para sincronizar el tab con la URL
  const [activeTab, setActiveTab] = useState('personal');

  const handleLogout = async () => {
    try {
      await logout();
      // Al cerrar sesión desde el perfil, ir a la página inicial
      router.push('/');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };



  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;

    try {
      // 🔹 Subir siempre al mismo path → reemplaza la imagen anterior
      const avatarRef = ref(storage, `avatars/${auth.currentUser.uid}/profile.png`);
      await uploadBytes(avatarRef, file);

      // 🔹 Obtener URL pública
      const url = await getDownloadURL(avatarRef);

      // 🔹 Actualizar perfil en Firebase Auth
      await updateProfile(user, { photoURL: url });

      setAvatar(url);
    } catch (error) {
      console.error("Error al subir avatar:", error);
    }
  };



  const isPasswordProvider = user?.providerData.some(
    (provider) => provider.providerId === "password"
  );


  const handlePasswordChange = async (e: React.FormEvent) => {
  e.preventDefault();
  setPasswordError("");
  setPasswordSuccess("");

  if (!user?.email || !currentPassword || !newPassword) {
    setPasswordError("Completa todos los campos.");
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    setPasswordSuccess("✅ Contraseña cambiada con éxito");
    setCurrentPassword("");
    setNewPassword("");
  } catch (err: any) {
    if (err.code === "auth/invalid-credential") {
      setPasswordError("❌ Contraseña actual incorrecta");
    } else {
      setPasswordError("❌ Error al cambiar contraseña");
    }
  }
};




  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditMode(false);
    try {
      if (user && name && user.displayName !== name) {
        await updateUserProfile(name, avatar);
      }
      setSuccess(true);
      setError('');
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('No se pudo actualizar el perfil. Intenta de nuevo.');
    }
  };

// 🔹 Función para cargar favoritos desde localStorage + Firestore
  const loadFavourites = async () => {
    setLoadingFavourites(true);

    try {
      // 1️⃣ Cargar primero desde localStorage para mostrar rápido
      const localFavs = JSON.parse(localStorage.getItem("favourites") || "[]");
      setFavourites(localFavs);

      // 2️⃣ Si hay usuario, sincronizar con Firestore
      if (user?.uid) {
        const remoteFavs = await getUserFavourites(user.uid);
        // Validar que los favoritos tienen la estructura correcta
        const validFavs = remoteFavs.filter((fav: any) => 
          fav.id && fav.name && fav.price !== undefined && fav.image
        ) as Favourite[];
        setFavourites(validFavs);
        localStorage.setItem("favourites", JSON.stringify(validFavs));
      }
    } catch (err) {
      console.error("Error cargando favoritos:", err);
    } finally {
      setLoadingFavourites(false);
    }
  };

  // 🔹 Cargar favoritos cuando el tab es "favorites"
  useEffect(() => {
    if (activeTab === "favorites") {
      loadFavourites();
    }
  }, [activeTab, user?.uid]);

  // 🔹 Escuchar cambios globales de favoritos
  useEffect(() => {
    const handleFavUpdate = () => loadFavourites();
    window.addEventListener("favourites-updated", handleFavUpdate);
    return () => window.removeEventListener("favourites-updated", handleFavUpdate);
  }, [user?.uid]);

  const removeFavouriteHandler = async (id: string | number) => {
    if (!user?.uid) return;

    try {
      await removeFavourite(user.uid, id);

      // Actualizar estado y localStorage
      const updatedFavs = favourites.filter(fav => fav.id !== id);
      setFavourites(updatedFavs);
      localStorage.setItem("favourites", JSON.stringify(updatedFavs));

      // 🔹 Disparar evento global
      window.dispatchEvent(new Event("favourites-updated"));
    } catch (error) {
      console.error("Error al eliminar favorito:", error);
    }
  };



  if (!user) {
    return <LoginRequired />;
  }

  return (
    <div className="d-flex flex-column min-vh-100 bg-cosmetic-secondary">
      <main>
        <Container className="py-5">
          <h1 className="fw-bold text-center mb-5 text-cosmetic-tertiary">Mi Cuenta</h1>
          <Row className="g-4 justify-content-center">
            <Col xs={12} md={4}>
              <Card className="border-0 shadow-sm mb-4 p-4">
                <Card.Body>
                  <div className="mb-3 text-center">
                  <div
                    style={{
                      width: "120px",
                      height: "120px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "2px solid #ddd",
                      margin: "0 auto",
                    }}
                  >

                    <Image
                      src={avatar}
                      alt="Avatar"
                      width={120}
                      height={120}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>

                    <h5 className="fw-bold mb-2 mt-2">{name}</h5>
                    <div className="mb-2 text-muted">{email}</div>
                  </div>
                  <div className="d-grid gap-2">
                    <Button autoFocus
                      className={`btn-profile rounded-1 ${activeTab === 'personal' ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab('personal');
                        router.push('/profile?tab=personal');
                      }}
                    >
                      <i className="bi bi-person me-2"></i>Información personal
                    </Button>

                    <Button
                      className={`btn-profile rounded-1 ${activeTab === 'orders' ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab('orders');
                        router.push('/profile?tab=orders');
                        loadPurchases();
                      }}
                    >
                      <i className="bi bi-bag-check me-2"></i>Historial de pedidos
                    </Button>

                    <Button
                      className={`btn-profile rounded-1 ${activeTab === 'favorites' ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab('favorites');
                        router.push('/profile?tab=favorites');
                      }}
                    >
                      <i className="bi bi-heart me-2"></i>Favoritos
                    </Button>

                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card className="border-0 shadow-sm mb-4">
                <Card.Body>
                  {activeTab === 'personal' && (
                    <div className="p-3">
                      <h5 className="fw-bold mb-3 text-cosmetic-tertiary">Información personal</h5>
                      <div className="text-center mb-4">
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                        <div
                          style={{
                            width: "120px",
                            height: "120px",
                            borderRadius: "50%",
                            overflow: "hidden",
                            border: "2px solid #ddd",
                            margin: "0 auto",
                          }}
                        >
                          <Image
                            src={avatar}
                            alt="Avatar"
                            width={120}
                            height={120}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        </div>

                          <Button                   
                            size="sm" 
                            className="btn-cosmetic-secondary position-absolute bottom-0 end-0 border shadow-sm" 
                            style={{ borderRadius: '50%' }}
                            onClick={() => fileInputRef.current?.click()}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <i className="bi bi-camera"></i>
                          </Button>
                          <input 
                            type="file" 
                            accept="image/*" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            onChange={handleAvatarChange}
                            onMouseDown={(e) => e.preventDefault()}
                          />
                        </div>
                      </div>


                      {editMode ? (
                        <>
                          {/* 🔹 FORMULARIO DE EDICIÓN DE NOMBRE */}
                          <Form onSubmit={handleEditSubmit} className="text-start">
                            <Form.Group className="mb-3">
                              <Form.Label>Nombre</Form.Label>
                              <Form.Control
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                className="rounded-1"
                              />
                            </Form.Group>

                            <Form.Group className="mb-3">
                              <Form.Label>Email</Form.Label>
                              <Form.Control
                                type="email"
                                value={email}
                                className="rounded-1"
                                disabled
                                style={{ backgroundColor: '#f8f9fa', cursor: 'not-allowed' }}
                              />
                              <Form.Text className="text-muted">
                                El email no se puede modificar por seguridad
                              </Form.Text>
                            </Form.Group>

                            <div className="d-flex gap-2 mt-3">
                              <Button onMouseDown={(e) => e.preventDefault()}
                               type="submit" className="btn-profile rounded-1">
                                Guardar cambios
                              </Button>
                              
                              <Button
                                onMouseDown={(e) => e.preventDefault()}
                                type="button"
                                className="btn-profile-secondary rounded-1"
                                onClick={() => setEditMode(false)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </Form>

                          {/* 🔹 FORMULARIO DE CAMBIO DE CONTRASEÑA (FUERA DEL FORM ANTERIOR) */}

                          {isPasswordProvider && (
                            <Form onSubmit={handlePasswordChange} className="mt-4">
                              <h5 className="fw-bold mb-3 ">Cambiar contraseña</h5>

                              <Form.Group className="mb-3">
                                <Form.Label>Contraseña actual</Form.Label>
                                <Form.Control
                                  type="password"
                                  value={currentPassword}
                                  onChange={(e) => setCurrentPassword(e.target.value)}
                                  required
                                />
                              </Form.Group>

                              <Form.Group className="mb-3">
                                <Form.Label>Nueva contraseña</Form.Label>
                                <Form.Control
                                  type="password"
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  required
                                />
                              </Form.Group>

                              <Button 
                              type="submit" 
                              className="btn-profile"
                              onMouseDown={(e) => e.preventDefault()}
                              >Cambiar contraseña</Button>

                              {passwordError && <Alert className="mt-3 alert-cosmetic-danger">{passwordError}</Alert>}
                              {passwordSuccess && <Alert className="mt-3 alert-cosmetic-success">{passwordSuccess}</Alert>}
                            </Form>
                          )}


                        </>
                      ) : (
                        <>
                          <div className="mb-2"><strong>Nombre:</strong> {name}</div>
                          <div className="mb-2"><strong>Email:</strong> {email}</div>
                              {/* BOTONES EDITAR Y CERRAR SESIÓN */}
                          <div className="d-flex justify-content-between mt-4">
                            <Button
                              className="btn-profile rounded-1"
                              onClick={() => setEditMode(true)}
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              Editar datos personales
                            </Button>

                            <Button
                            onMouseDown={(e) => e.preventDefault()}
                              className="btn-cosmetic-accent rounded-1"
                              onClick={handleLogout}
                            >
                              <i className="bi bi-box-arrow-right me-2"></i>Cerrar sesión
                            </Button>
                          </div>

                        </>
                      )}

                    </div>
                  )}
                  {activeTab === 'orders' && (
                    <div className="p-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold mb-0">Historial de Pedidos</h5>
                      </div>
                      {loading ? (
                        <div className="text-center py-5">
                          <Spinner animation="border" role="status" className="mb-3" />
                          <p className="text-muted">Cargando tus compras...</p>
                        </div>
                      ) : purchases.length === 0 ? (
                        <div className="text-center py-5">
                          <i className="bi bi-box2 fs-1"></i>
                          <h5 className="fw-bold mb-2">No tienes compras recientes</h5>
                          <Link onMouseDown={(e) => e.preventDefault()} href="/products" className="btn btn-primary rounded-1 px-4 mt-3 text-decoration-none">Ver Productos</Link>
                        </div>
                      ) : (
                        <>
                          <ListGroup>
                            {purchases.map((purchase, idx) => (
                              <ListGroup.Item key={idx} className="mb-3 bg-white rounded-1 shadow-sm border-0">
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>
                                    <h6 className="fw-bold mb-1" style={{ color: "var(--cosmetic-primary)" }}>
                                      <i className="bi bi-box me-2"></i>
                                      Pedido #{idx + 1}
                                    </h6>
                                    <div className="small text-muted mb-2">
                                      <i className="bi bi-clock me-1"></i>
                                      {formatDate(purchase.date)}
                                    </div>
                                    <div className="mb-2">
                                      <span className="small text-muted">Productos:</span>
                                      <div className="mt-1">
                                        {purchase.items.map((item: { id: string; name: string; image: string; quantity: number }, i: number) => (
                                          <div key={i} className="d-flex align-items-center mb-1">
                                            <Image src={item.image} alt={item.name} width={35} height={35} className="me-2 rounded-1 inventory-image" />
                                            <span className="small">
                                              <strong>{item.name}</strong> 
                                              <span className="text-muted"> (Cantidad: {item.quantity})</span>
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-end">
                                    <div className="fw-bold fs-5 mb-2 text-success">${purchase.total.toFixed(2)}</div>
                                    <Badge bg="success">
                                      <i className="bi bi-check-circle me-1"></i>
                                      Pagado
                                    </Badge>
                                  </div>
                                </div>
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                          <div className="row mt-4 p-3 bg-cosmetic-secondary rounded">
                            <div className="col-md-6">
                              <h6 className="fw-bold mb-2">
                                <i className="bi bi-graph-up me-2"></i>
                                Resumen de compras
                              </h6>
                              <p className="mb-1"><strong>Total de pedidos:</strong> {purchases.length}</p>
                              <p className="mb-0"><strong>Total gastado:</strong> <span className="text-success fw-bold">${purchases.reduce((acc, p) => acc + p.total, 0).toFixed(2)}</span></p>
                            </div>
                            <div className="col-md-6 text-md-end">
                              <small className="text-muted">
                                <i className="bi bi-info-circle me-1"></i>
                                Los pedidos se muestran del más reciente al más antiguo
                              </small>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {activeTab === 'favorites' && (
                    <div className="p-3 text-center">
                      <h5 className="fw-bold mb-3">Favoritos</h5>
                      {loadingFavourites ? (
                        <div className="text-center py-5">
                          <Spinner animation="border" role="status" className="mb-3" />
                          <p className="text-muted">Cargando tus favoritos...</p>
                        </div>
                      ) : favourites.length === 0 ? (
                        <>
                          <i className="bi bi-heart fs-1 text-danger mb-3"></i>
                          <p className="text-muted">Aún no tienes productos favoritos.</p>
                          <Link href="/products" onMouseDown={(e) => e.preventDefault()} className="btn btn-cosmetic-primary rounded-1 px-4 mt-3 text-decoration-none">Ver Productos</Link>
                        </>
                      ) : (
                        <Row className="g-4 justify-content-center">
                          {favourites.map((fav: Favourite) => (
                            <Col xs={12} md={6} lg={4} key={fav.id}>
                              <Card className="mb-4 border-0 shadow-sm text-start">
                                <Card.Body>
                                  <div className="d-flex align-items-center mb-3">
                                    <Image src={fav.image} alt={fav.name} width={60} height={60} className="me-3 rounded-1 inventory-image" />
                                    <div>
                                      <h5 className="fw-bold mb-1">{fav.name}</h5>
                                      <div className="fw-bold mb-1" style={{ color: "var(--cosmetic-primary)" }}>${fav.price.toFixed(2)}</div>
                                      <div className="small text-muted mb-2">{fav.description?.substring(0, 60)}...</div>
                                    </div>
                                  </div>
                                </Card.Body>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                      )}
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Container>
      </main>
      <Footer/>
      {/* Footer siempre visible */}

    </div>
  );
};

export default ProfilePage;